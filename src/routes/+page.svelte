<script>
import { onDestroy, untrack } from 'svelte'

import { SPSC } from 'spsc'
// import { SplitPane } from '@rich_harris/svelte-split-pane'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'

import SplitPane from '$lib/components/SplitPane.svelte'
import AboutPanel from '$lib/components/AboutPanel.svelte'
import HeaderExamplePicker from '$lib/components/HeaderExamplePicker.svelte'
import AgdaSidePanel from '$lib/components/AgdaSidePanel.svelte'
import { MobilePanelState } from '$lib/mobile-panel-state.svelte'
import { loadSplitRatio, saveSplitRatio } from '$lib/split-ratio'
import AppHeader from '$lib/components/AppHeader.svelte'
import SettingsPanel from '$lib/components/SettingsPanel.svelte'
import { AgdaController, deployProfiles, resolveProfileLibraries } from '$lib/controller.svelte'
import { myCodeMirrorTheme } from '$lib/codemirror/theme'
import { agdaInputMethod } from '$lib/codemirror/agda-input'
import { agdaSupport } from '$lib/agda'
import { getAgdaDocumentVersion, getAgdaGoals, mergeGoalInfos } from '$lib/agda/goal-state'
import { getGoalAtPosition, getGoalRangeById } from '$lib/agda/goals'
import {
  runAgdaShortcut as runAgdaShortcutShared,
  runAgdaShortcutWithInputPrompt as runAgdaShortcutWithInputPromptShared,
} from '$lib/agda/run-shortcut'
import {
  advanceAgdaChord,
  agdaShortcutRegistry,
  chordStepsOf,
  chordYieldsToSelection,
  formatChordHint,
  isUniversalArgumentEvent,
  findAgdaShortcutById,
  reservedChordSequences,
} from '$lib/agda/shortcuts'
import { lookupChar, formatCodePoint } from '$lib/agda/input-lookup'
import {
  abortCommand,
  goalTypeContextCommand,
} from '$lib/agda/commands'
import { dispatchAgdaShortcut, MAX_PREFIX_COUNT } from '$lib/agda/shortcut-actions'
import { ShortcutOverridesState } from '$lib/agda/shortcut-overrides-state.svelte'
import { CommandInputState } from '$lib/agda/command-input-state.svelte'

import { clearGoals, clearRunningInfo, emitRunningInfo, removeGoalInfo, setGoalInfo } from '$lib/agda/effects'
import { triggerPrefetch } from '$lib/agda/prefetch'

const driveLockSab = new SharedArrayBuffer(4)
const driveStdinSab = SPSC.allocateArrayBuffer(4096)
const driveStdoutSab = SPSC.allocateArrayBuffer(4096)

const agdaStdinSab = SPSC.allocateArrayBuffer(4096)
const agdaStdoutSab = SPSC.allocateArrayBuffer(4096)

const agdaController = new AgdaController({
  agdaBuffers: {
    stdin: agdaStdinSab,
    stdout: agdaStdoutSab,
  },
  driveBuffers: {
    lock: driveLockSab,
    stdin: driveStdinSab,
    stdout: driveStdoutSab,
  },
})

$effect(() => {
  if (agdaController.alsWorkerStatus === 'initial') {
    untrack(() => agdaController.startALSWASM())
  }
})

function runtimeSummary() {
  const profile = agdaController.activeProfile
  return [
    { label: 'Agda runtime', value: profile.als },
    ...resolveProfileLibraries(profile).map(lib => ({ label: lib.label ?? lib.name, value: lib.version ? `v${lib.version}` : lib.name })),
  ]
}

/** @param {string} profileLabel */
async function onDeploymentProfileChange(profileLabel) {
  try {
    await agdaController.switchProfile(profileLabel)
  } catch (err) {
    textboxContent += `Failed to switch environment: ${err instanceof Error ? err.message : String(err)}\n`
  }
}

const defaultSource = '{-# OPTIONS --cubical --guardedness #-}\n\nopen import Cubical.Foundations.Prelude\n'
const LS_SHORTCUT_OVERRIDES_KEY = 'agda-playground.shortcut-overrides.v1'
const LS_PANEL_SPLIT_KEY = 'agda-playground.goals-messages-split.v1'
const LS_WORKSPACE_SPLIT_KEY = 'agda-playground.workspace-split.v1'

const scratchpadExamples = [
  {
    id: 'cubical-prelude',
    label: 'Cubical Prelude',
    description: 'Minimal Cubical Agda import.',
    source: defaultSource,
  },
  {
    id: 'nat-basics',
    label: 'Nat basics',
    description: 'Define a small natural number datatype.',
    source: `data N : Set where
  z : N
  s : N -> N

one : N
one = s z
`,
  },
  {
    id: 'case-split-plus',
    label: 'Case split practice',
    description: 'Practice C-c C-c on the first argument.',
    source: `data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
a + b = ?
`,
  },
  {
    id: 'auto-identity',
    label: 'Auto practice',
    description: 'Practice C-c C-a in a simple goal.',
    source: `data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! !}
`,
  },
  {
    id: 'refine-elaborate',
    label: 'Refine / elaborate',
    description: 'Practice C-c C-r or C-c C-m with an expression.',
    source: `data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! n !}
`,
  },
  {
    id: 'query-bool',
    label: 'Query practice',
    description: 'Practice infer, compute, module contents, and why-in-scope.',
    source: `open import Agda.Builtin.Bool

test : Bool
test = true
`,
  },
  {
    id: 'stdlib-nat',
    label: 'standard-library Nat',
    description: 'Minimal standard-library import.',
    source: 'open import Data.Nat.Base\n',
  },
]

let width = $state(0)
let isMobile = $derived(width < 540)



onDestroy(() => {
  agdaController.terminateALSWASM()
})

const basicTheme = EditorView.theme({
  '.cm-panels': {
    // FIXME: should decouple from this extension
    marginRight: '-4px',
    paddingRight: '4px',
  },
  '.cm-scroller': {
    overscrollBehavior: 'contain',
  },
})

/**
 * @param {string} label
 * @param {EditorView} view
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext) => string | Promise<void>} command
 * @param {import('$lib/agda/run-shortcut').AgdaShortcutHooks} [hooks]
 */
function runAgdaShortcut(label, view, command, hooks) {
  runAgdaShortcutShared({
    label, view, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    hooks,
    command,
  })
}

/**
 * @param {string} label
 * @param {EditorView} view
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>} command
 * @param {import('$lib/agda/run-shortcut').AgdaShortcutHooks} [hooks]
 */
function runAgdaShortcutWithInputPrompt(label, view, command, hooks) {
  runAgdaShortcutWithInputPromptShared({
    label, view, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    hooks,
    command,
    onNeedsInput: commandInputState.open,
  })
}

function runLoadShortcut() {
  void (async () => {
    if (agdaController.alsWorkerStatus !== 'active') {
      textboxContent += 'Load failed: Agda is not active.\n'
      return
    }

    try {
      await loadAgdaFile()
    } catch {
      // loadAgdaFile already writes the failure to the log.
    }
  })()
}

/** @param {EditorView} view */
function getActiveGoalId(view) {
  const docLength = view.state.doc.length
  const head = view.state.selection.main.head
  const previousPos = Math.max(0, head - 1)
  const nextPos = Math.min(docLength, head + 1)
  return (
    getGoalAtPosition(view.state, head) ??
    getGoalAtPosition(view.state, previousPos) ??
    getGoalAtPosition(view.state, nextPos)
  )?.id ?? null
}

/**
 * @param {EditorView} view
 * @param {1 | -1} direction
 */
function focusAdjacentGoal(view, direction) {
  const goals = getAgdaGoals(view.state)
  if (goals.length === 0) {
    textboxContent += 'Goal navigation failed: No goals.\n'
    return
  }

  const head = view.state.selection.main.head
  const currentIndex = goals.findIndex(goal => goal.outerFrom <= head && head <= goal.outerTo)
  let targetIndex

  if (currentIndex >= 0) {
    targetIndex = (currentIndex + direction + goals.length) % goals.length
  } else if (direction > 0) {
    const nextIndex = goals.findIndex(goal => goal.outerFrom > head)
    targetIndex = nextIndex >= 0 ? nextIndex : 0
  } else {
    for (let i = goals.length - 1; i >= 0; i--) {
      if (goals[i].outerTo < head) {
        targetIndex = i
        break
      }
    }
    targetIndex ??= goals.length - 1
  }

  focusGoal(goals[targetIndex].id)
}

/** @param {EditorView} view */
function syncGoalPanel(view) {
  panelGoalInfos = getAgdaGoals(view.state).map(goal => ({
    id: goal.id,
    range: goal.range,
    type: goal.type,
    context: goal.context,
  }))

  const active = getActiveGoalId(view)
  activeGoalId = active != null && panelGoalInfos.some(goal => goal.id === active) ? active : null
}

/**
 * @param {number} goalId
 * @param {number} documentVersion
 */
let autoFetchingGoalTypes = $state(false)

async function autoFetchGoalTypes(/** @type {number} */ documentVersion) {
  if (autoFetchingGoalTypes) return
  autoFetchingGoalTypes = true
  try {
    const goalIds = /** @type {number[]} */ (panelGoalInfos
      .filter(g => typeof g.id === 'number' && g.type === undefined)
      .map(g => g.id))
    for (const goalId of goalIds) {
      const view = agdaController.editorView
      if (!view || getAgdaDocumentVersion(view.state) !== documentVersion) break
      if (agdaController.alsWorkerStatus !== 'active') break
      if (panelGoalInfos.find(g => g.id === goalId)?.type !== undefined) continue
      await agdaController.runAgdaInteraction(
        goalTypeContextCommand('Simplified', { id: goalId }),
        { suppressDisplayInfo: true },
      )
    }
  } finally {
    autoFetchingGoalTypes = false
  }
}

async function requestActiveGoalDetails(/** @type {number} */ goalId, /** @type {number} */ documentVersion) {
  const requestKey = `${documentVersion}:${goalId}`
  if (activeGoalDetailRequestKey === requestKey) return

  activeGoalDetailRequestKey = requestKey
  activeGoalDetailStatus = 'loading'
  activeGoalDetailError = ''

  try {
    await agdaController.runAgdaInteraction(
      goalTypeContextCommand('Simplified', { id: goalId }),
      { suppressDisplayInfo: true },
    )
    if (activeGoalDetailRequestKey === requestKey) activeGoalDetailStatus = 'ready'
  } catch (err) {
    if (activeGoalDetailRequestKey === requestKey) {
      activeGoalDetailStatus = 'error'
      activeGoalDetailError = err instanceof Error ? err.message : String(err)
    }
  }
}

/** @type {import('$lib/agda/shortcuts').ChordStep[]} */
let chordProgress = $state([])
/** `C-u` presses waiting for the next shortcut (its normalization prefix). */
let universalArgumentCount = $state(0)

function clearChordProgress() {
  chordProgress = []
  universalArgumentCount = 0
}

/** @param {EditorView} view */
function lookupUnicodeAtCursor(view) {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to > from ? to : from + 2)
  const cp = text.codePointAt(0)
  if (cp === undefined || text.length === 0) {
    agdaController.appendQueryResult('Unicode Lookup', 'No character at cursor.')
    return
  }
  const char = String.fromCodePoint(cp)
  const sequences = lookupChar(char)
  const uLabel = formatCodePoint(cp)
  const content = sequences.length === 0
    ? `${char}  (${uLabel})\nNo Agda input sequences found.`
    : `${char}  (${uLabel})\n${sequences.map(s => '\\' + s).join('  ')}`
  agdaController.appendQueryResult('Unicode Lookup', content)
}

/**
 * @param {import('$lib/agda/shortcuts').AgdaShortcutDefinition} shortcut
 * @param {EditorView} view
 * @param {number} [prefixCount] pending `C-u` presses
 */
function runAgdaShortcutDefinition(shortcut, view, prefixCount = 0) {
  dispatchAgdaShortcut(shortcut, {
    load: runLoadShortcut,
    focusAdjacentGoal: direction => focusAdjacentGoal(view, direction),
    run: (label, command, hooks) => runAgdaShortcut(label, view, command, hooks),
    runWithInputPrompt: (label, command, hooks) => runAgdaShortcutWithInputPrompt(label, view, command, hooks),
    getAlsRouter: () => agdaController.alsRouter,
  }, prefixCount)
}

const agdaKeymap = keymap.of(agdaShortcutRegistry.flatMap(shortcut =>
  shortcut.bindings
    .filter(binding => binding.kind === 'keymap')
    .map(binding => ({
      key: binding.key,
      run: (/** @type {EditorView} */ view) => {
        runAgdaShortcutDefinition(shortcut, view)
        return true
      },
    }))))

/**
 * Handles Agda/Emacs-style multi-key chords (e.g. Ctrl-c Ctrl-l, or
 * Ctrl-c Ctrl-x Ctrl-a for abort) before the browser can consume shortcuts
 * such as Ctrl-L. Advances chordProgress by one key per call against
 * chordTable (reserved sequences + the active shortcut registry).
 *
 * @param {KeyboardEvent} event
 * @param {EditorView} view
 */
function handleAgdaChordKeydown(event, view) {
  if (event.isComposing || !view.hasFocus) return false

  // Modifier-only keypresses are not a chord key; the user may release and
  // re-press Ctrl between chord keys without cancelling the chord.
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return false

  // With text selected, a leading Ctrl-c / Ctrl-x / Ctrl-u is copy / cut /
  // undo-selection, not the start of an Agda chord.
  if (chordYieldsToSelection(view.state.selection, chordProgress.length > 0 || universalArgumentCount > 0)) {
    return false
  }

  // `C-u` before a shortcut selects its normalization variant. Consumed here
  // (also keeping it from the browser's view-source and CodeMirror's own
  // Mod-u undoSelection) and only while no chord is in progress, as in
  // agda-mode-vscode, where it is only a leading prefix.
  if (chordProgress.length === 0 && isUniversalArgumentEvent(event)) {
    universalArgumentCount = Math.min(universalArgumentCount + 1, MAX_PREFIX_COUNT)
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  const result = advanceAgdaChord(chordProgress, event, chordTable)

  if (result.status === 'no-match') {
    if (chordProgress.length === 0 && universalArgumentCount === 0) return false
    clearChordProgress()
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  event.preventDefault()
  event.stopPropagation()

  if (result.status === 'partial') {
    chordProgress = result.progress
    return true
  }

  const prefixCount = universalArgumentCount
  clearChordProgress()
  if (result.id === '__unicode-lookup') {
    lookupUnicodeAtCursor(view)
  } else if (result.id === '__abort') {
    sendAbort()
  } else {
    const shortcut = findAgdaShortcutById(result.id, shortcutOverrideState.registry)
    if (shortcut) runAgdaShortcutDefinition(shortcut, view, prefixCount)
  }

  return true
}

const agdaChordKeymap = EditorView.domEventHandlers({
  keydown(event, view) {
    return handleAgdaChordKeydown(event, view)
  },
})

/** @type {import('svelte/attachments').Attachment} */
function codeMirror(el) {
  const ev = new EditorView({
    doc: localStorage.getItem(agdaController.docStorageKey) ?? defaultSource,
    parent: el,
    extensions: [
      basicSetup,
      myCodeMirrorTheme(),
      basicTheme,
      // tabindex is explicit so the scroller counts as keyboard-reachable (axe).
      EditorView.contentAttributes.of({ 'aria-label': 'Agda source', tabindex: '0' }),
      agdaSupport(),
      agdaInputMethod(),
      agdaKeymap,
      agdaChordKeymap,
      // basicSetup deliberately doesn't bind Tab to indentation (Tab moves
      // focus by default, for accessibility) -- opt in explicitly. Placed
      // after the Agda keymaps so any future Agda Tab binding would win.
      keymap.of([indentWithTab]),
      EditorView.updateListener.of(update => {
        const goalEffects = update.transactions.some(tr => tr.effects.length > 0)
        if (update.selectionSet || update.docChanged || goalEffects) {
          syncGoalPanel(update.view)
        }
      }),
      agdaController.lspClientCompartment.of([]),
      EditorState.changeFilter.of(tr => {
        for (const e of tr.effects) {
          if (e.is(emitRunningInfo)) {
            // agda-mode-vscode only surfaces debugLevel 1 RunningInfo messages
            // in the user-visible panel; anything more verbose goes to an
            // internal-only DebugBuffer never shown to the user by default
            // (State__Response.res). Match that instead of dumping every
            // debug level into the visible log.
            if (e.value.debugLevel <= 1) textboxContent += e.value.message
          } else if (e.is(clearRunningInfo)) {
            // Highlighting commands may clear Agda's running-info buffer after
            // loading succeeds; keep the visible load log until the next Load.
          } else if (e.is(setGoalInfo)) {
            goalInfos = mergeGoalInfos(goalInfos, e.value)
          } else if (e.is(removeGoalInfo)) {
            goalInfos = goalInfos.filter(goal => goal.id !== e.value)
          }
        }
        return true
      })
    ],
  })

  agdaController.connectEditorView(ev)
  const captureAgdaChord = (/** @type {KeyboardEvent} */ event) => {
    if (handleAgdaChordKeydown(event, ev)) {
      event.stopImmediatePropagation()
    }
  }
  const reloadAfterAgdaEdit = () => {
    void (async () => {
      while (agdaController.alsWorkerStatus === 'active' && agdaController.iotcmStatus !== 'ready') {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      if (agdaController.alsWorkerStatus === 'active') {
        await loadAgdaFile()
      }
    })()
  }
  window.addEventListener('keydown', captureAgdaChord, { capture: true })
  ev.dom.addEventListener('agda-reload-needed', reloadAfterAgdaEdit)

  return () => {
    window.removeEventListener('keydown', captureAgdaChord, { capture: true })
    ev.dom.removeEventListener('agda-reload-needed', reloadAfterAgdaEdit)
    clearChordProgress()
    ev.destroy()
  }
}

function clearScratchpadInteractionState() {
  goalInfos = []
  panelGoalInfos = []
  agdaDiagnostics = []
  activeGoalId = null
  activeGoalDetailRequestKey = ''
  activeGoalDetailStatus = 'idle'
  activeGoalDetailError = ''
  commandInputState.clear()
  settingsPanelVisible = false
  agdaController.editorView?.dispatch({ effects: clearGoals.of() })
}

/** @param {string} source */
function replaceScratchpadSource(source) {
  const view = agdaController.editorView
  if (!view) return
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: source },
    selection: { anchor: 0 },
  })
  localStorage.setItem(agdaController.docStorageKey, source)
  clearScratchpadInteractionState()
  textboxContent = 'Example loaded into editor. Click Load to type-check it.\n'
  view.focus()
}

/** @param {string} exampleId */
function selectScratchpadExample(exampleId) {
  selectedExampleId = exampleId
  const example = scratchpadExamples.find(example => example.id === exampleId)
  if (example) replaceScratchpadSource(example.source)
}

function openSettingsPanel() {
  shortcutOverrideState.beginEditing()
  settingsPanelVisible = true
}

function closeSettingsPanel() {
  settingsPanelVisible = false
  agdaController.editorView?.focus()
}

function copyEditorCode() {
  const text = agdaController.editorView?.state.doc.toString() ?? ''
  navigator.clipboard.writeText(text)
}

function exportAgdaFile() {
  const text = agdaController.editorView?.state.doc.toString() ?? ''
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'source.agda'
  a.click()
  URL.revokeObjectURL(url)
}

/** @param {Event} event */
function openAgdaFile(event) {
  const input = /** @type {HTMLInputElement} */ (event.currentTarget)
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = /** @type {string} */ (reader.result)
    const view = agdaController.editorView
    if (!view) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    // The editor no longer holds any example, so the picker shouldn't
    // highlight one.
    selectedExampleId = ''
  }
  reader.readAsText(file)
  input.value = ''
}

/** @param {string} id */
function runAgdaShortcutById(id) {
  if (!agdaController.editorView) return
  const shortcut = findAgdaShortcutById(id, shortcutOverrideState.registry)
  if (shortcut) {
    runAgdaShortcutDefinition(shortcut, agdaController.editorView)
    agdaController.editorView.focus()
  }
}

function toggleImplicitArgsFromSettings() {
  runAgdaShortcutById('toggle-implicit-args')
}

function toggleIrrelevantArgsFromSettings() {
  runAgdaShortcutById('toggle-irrelevant-args')
}

function sendAbort() {
  return /** @type {any} */(agdaController.lspClient).request('agda', {
    tag: 'CmdReq',
    contents: `IOTCM ${JSON.stringify(agdaController.currentFilePath)} NonInteractive Direct ${abortCommand()}`,
  })
}

/** @param {number | string} goalId */
function focusGoal(goalId) {
  if (typeof goalId !== 'number' || !agdaController.editorView) return

  const view = agdaController.editorView
  const range = getGoalRangeById(view.state, goalId)
  if (!range) return

  const cursor = Math.min(range.to, range.from + 3)
  view.dispatch({
    selection: { anchor: cursor },
    scrollIntoView: true,
  })
  view.focus()
}

async function loadAgdaFile() {
  textboxContent = `Loading ${agdaController.currentFilePath}...\n`
  goalInfos = []
  panelGoalInfos = []
  agdaDiagnostics = []
  if (agdaController.alsRouter) {
    agdaController.alsRouter.lastAgdaDiagnostics = []
  }
  activeGoalId = null
  activeGoalDetailRequestKey = ''
  activeGoalDetailStatus = 'idle'
  activeGoalDetailError = ''
  commandInputState.clear()
  agdaController.editorView?.dispatch({ effects: clearGoals.of() })

  const prefetchFn = agdaController.backend?.prefetchAgdai?.bind(agdaController.backend)
  if (prefetchFn && agdaController.editorView && agdaController.receivedNumericAgdaVersion) {
    triggerPrefetch(
      agdaController.editorView.state.doc.toString(),
      prefetchFn,
      resolveProfileLibraries(agdaController.activeProfile),
      agdaController.receivedNumericAgdaVersion,
    )
  }

  try {
    await agdaController.loadAgdaFile()
    syncAgdaDiagnostics()
    textboxContent += 'Load finished.\n'
  } catch (err) {
    syncAgdaDiagnostics()
    textboxContent += `Load failed: ${err instanceof Error ? err.message : String(err)}\n`
    throw err
  }
}

function syncAgdaDiagnostics() {
  agdaDiagnostics = [...(agdaController.alsRouter?.lastAgdaDiagnostics ?? [])]
}

let textboxContent = $state('')
let selectedExampleId = $state('cubical-prelude')
let goalInfos = $state(/** @type {{id: number | string, range?: string, type?: string, context?: string}[]} */([]))
let panelGoalInfos = $state(/** @type {{id: number | string, range?: string, type?: string, context?: string}[]} */([]))
let agdaDiagnostics = $state(/** @type {import('$lib/agda/diagnostics').AgdaDiagnostic[]} */([]))
let activeGoalId = $state(/** @type {number | string | null} */(null))
let activeGoalDetailRequestKey = $state('')
let activeGoalDetailStatus = $state(/** @type {'idle' | 'loading' | 'ready' | 'error'} */('idle'))
let activeGoalDetailError = $state('')
let selectedMessageTab = $state(/** @type {'log' | 'queries' | 'errors'} */('log'))
let previousQueryResultCount = 0
let previousDiagnosticCount = 0
// The editor's share of the workspace: on desktop the Agda panel defaults
// to roughly 380px at common widths and the user's own split is remembered;
// phones (editor over panel) keep their own split.
let desktopSplit = $state(loadSplitRatio(LS_WORKSPACE_SPLIT_KEY, 0.72, [0.25, 0.9]))
let phoneSplit = $state(0.58)
$effect(() => saveSplitRatio(LS_WORKSPACE_SPLIT_KEY, desktopSplit))

// Phones: the editor over a collapsible Goals / Messages panel.
const mobilePanel = new MobilePanelState()
$effect(() => mobilePanel.watchKeyboard(window))

// Auto-switch the Messages tab to whichever kind of result just arrived --
// matches agda-mode-vscode's single-panel model (State__View.Panel.display
// always shows the latest response). Edge-triggered on a genuine increase
// (not a level check) so clearing results/diagnostics, or the user manually
// switching tabs when nothing new has happened, never fights the user.
$effect(() => {
  const count = agdaController.queryResults.length
  if (count > previousQueryResultCount) {
    selectedMessageTab = 'queries'
    // On a phone the result would otherwise land on a hidden tab.
    if (untrack(() => isMobile)) mobilePanel.showMessages()
  }
  previousQueryResultCount = count
})
$effect(() => {
  const count = agdaDiagnostics.length
  if (count > previousDiagnosticCount) {
    selectedMessageTab = 'errors'
    if (untrack(() => isMobile)) mobilePanel.showMessages()
  }
  previousDiagnosticCount = count
})

// A command asking for input shows its prompt in Goals; on a phone, open
// the panel on Goals so the prompt is visible.
$effect(() => {
  if (commandInputState.prompt && untrack(() => isMobile)) untrack(() => mobilePanel.showPrompt())
})

/** Runs a command picked from the header's Commands menu, then hands focus back to the editor. */
function runCommandFromMenu(/** @type {import('$lib/agda/shortcuts').AgdaShortcutDefinition} */ shortcut) {
  const view = agdaController.editorView
  if (!view) return
  runAgdaShortcutDefinition(shortcut, view)
  view.focus()
}

const commandsMenuFileActions = [
  { id: 'copy-code', label: 'Copy code', run: () => copyEditorCode() },
  { id: 'open-file', label: 'Open file…', run: () => fileInput.click() },
  { id: 'export-file', label: 'Export file', run: () => exportAgdaFile() },
]
let settingsPanelVisible = $state(false)
let aboutPanelVisible = $state(false)
/** @type {HTMLInputElement} */
let fileInput
const shortcutOverrideState = new ShortcutOverridesState(LS_SHORTCUT_OVERRIDES_KEY)
let chordTable = $derived([
  ...reservedChordSequences,
  ...shortcutOverrideState.registry.flatMap(shortcut =>
    shortcut.bindings
      .filter(binding => binding.kind === 'chord')
      .map(binding => ({ id: shortcut.id, steps: chordStepsOf(binding) }))),
])
const commandInputState = new CommandInputState({
  agdaController,
  getDocState: () => agdaController.editorView?.state,
  focusEditor: () => agdaController.editorView?.focus(),
  appendLog: msg => textboxContent += msg,
})

$effect(() => {
  const view = agdaController.editorView
  const goalId = activeGoalId
  const goal = panelGoalInfos.find(goal => goal.id === goalId)

  if (
    !view ||
    typeof goalId !== 'number' ||
    !goal ||
    goal.context !== undefined ||
    agdaController.alsWorkerStatus !== 'active' ||
    agdaController.iotcmStatus !== 'ready'
  ) {
    return
  }

  const documentVersion = getAgdaDocumentVersion(view.state)
  untrack(() => {
    void requestActiveGoalDetails(goalId, documentVersion)
  })
})

$effect(() => {
  if (autoFetchingGoalTypes) return
  if (panelGoalInfos.every(g => g.type !== undefined)) return
  if (agdaController.alsWorkerStatus !== 'active') return
  if (agdaController.iotcmStatus !== 'ready') return
  const view = agdaController.editorView
  if (!view) return
  const documentVersion = getAgdaDocumentVersion(view.state)
  untrack(() => {
    void autoFetchGoalTypes(documentVersion)
  })
})
</script>

{#snippet editor(/** @type {'horizontal' | 'vertical'} */ orientation)}
<SplitPane
  {orientation}
  bind:ratio={() => (isMobile ? phoneSplit : desktopSplit), (value) => { if (isMobile) phoneSplit = value; else desktopSplit = value }}
  class={isMobile ? (mobilePanel.collapsed ? 'mobile-split collapsed' : 'mobile-split') : ''} dividerLabel="Resize editor and Agda panel" style="--divider-min-position: 25%; --divider-max-position: 90%;">
  {#snippet start()}
  <section class="editor-section">
  <section class="editor-pane">
    <div class="editor-wrap">
      <div class="container" {@attach codeMirror}></div>
      {#if chordProgress.length > 0 || universalArgumentCount > 0}
        <div class="chord-hint" aria-live="polite" aria-label="Waiting for next chord key">
          {formatChordHint(universalArgumentCount, chordProgress)}
        </div>
      {/if}
    </div>
  </section>
  </section>
  {/snippet}
  {#snippet end()}
  <AgdaSidePanel
    {agdaController}
    {deployProfiles}
    {onDeploymentProfileChange}
    splitStorageKey={LS_PANEL_SPLIT_KEY}
    commandInputPrompt={commandInputState.prompt}
    commandInputError={commandInputState.error}
    {panelGoalInfos}
    {activeGoalId}
    {activeGoalDetailStatus}
    {activeGoalDetailError}
    bind:commandInputElement={commandInputState.element}
    onSubmitCommandInput={commandInputState.submit}
    onCancelCommandInput={commandInputState.cancel}
    onFocusGoal={focusGoal}
    {textboxContent}
    {agdaDiagnostics}
    bind:selectedMessageTab
    mobile={isMobile ? mobilePanel : null} />
  {/snippet}
</SplitPane>
<SettingsPanel
  visible={settingsPanelVisible}
  onClose={closeSettingsPanel}
  {agdaController}
  onToggleImplicitArgs={toggleImplicitArgsFromSettings}
  onToggleIrrelevantArgs={toggleIrrelevantArgsFromSettings}
  {deployProfiles}
  {runtimeSummary}
  shortcutDrafts={shortcutOverrideState.drafts}
  shortcutDraftValidation={shortcutOverrideState.draftValidation}
  shortcutOverrideMessage={shortcutOverrideState.message}
  activeAgdaShortcutRegistry={shortcutOverrideState.registry}
  onSaveShortcutOverrides={shortcutOverrideState.save}
  onResetShortcutOverrides={shortcutOverrideState.reset}
  onSetShortcutDraft={shortcutOverrideState.setDraft}
  onClearShortcutDraft={shortcutOverrideState.clearDraft}
/>
<AboutPanel bind:visible={aboutPanelVisible} {runtimeSummary} />
{/snippet}




<input
  bind:this={fileInput}
  type="file"
  accept=".agda,.lagda,.lagda.md"
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  onchange={openAgdaFile}>

<main
  class="app-main"
  bind:clientWidth={width}>
  <AppHeader
    title="Agda Playground"
    current="playground"
    registry={shortcutOverrideState.registry}
    onRunCommand={runCommandFromMenu}
    fileActions={commandsMenuFileActions}
    activeGoalLabel={activeGoalId === null ? null : `?${activeGoalId}`}
    onOpenAbout={() => { aboutPanelVisible = true }}
    onOpenSettings={openSettingsPanel}
    compact={isMobile}>
    {#snippet picker()}
      <HeaderExamplePicker examples={scratchpadExamples} {selectedExampleId} onSelect={selectScratchpadExample} />
    {/snippet}
  </AppHeader>
  <div class="app-workspace">
    {@render editor(isMobile ? 'vertical' : 'horizontal')}
  </div>
</main>

<style>
/* The header spans the whole window; the editor and Agda panels share the
   rest. */
.app-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-canvas);
}

.app-workspace {
  flex: 1 1 0;
  min-height: 0;
}

/* Phones: the editor over the Agda panel, with a wider grab area on the
   divider; collapsed, the panel shrinks to its one-line bar and the editor
   takes the rest. */
:global(.split-pane.mobile-split) {
  --divider-draggable-area: 20px;
}
:global(.split-pane.mobile-split > .split-divider::before) {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  width: 36px;
  height: 4px;
  margin: -2px 0 0 -18px;
  border-radius: 999px;
  background: var(--app-border-strong);
}
:global(.split-pane.mobile-split.collapsed > .split-divider) {
  display: none;
}
:global(.split-pane.mobile-split.collapsed > .split-start) {
  flex: 1 1 0;
  height: auto !important;
}
:global(.split-pane.mobile-split.collapsed > .split-end) {
  flex: 0 0 auto;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}

.editor-wrap {
  position: relative;
  flex: 1 1;
  min-height: 0;
}

.container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  min-height: 0;
}

.chord-hint {
  position: absolute;
  bottom: 10px;
  right: 14px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--app-text-strong);
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer, #e8e8e8) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-border-strong) 70%, transparent);
  border-radius: 4px;
  padding: 2px 7px;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.04em;
}

.container > :global(*) {
  flex: 1 1;
}

.container :global(.cm-editor) {
  background: var(--quiet-neutral-fill);
}

.editor-section {
  display: flex;
  flex-direction: column;
  height: calc(100% - 1px);
  position: relative;
  background: var(--quiet-neutral-fill);
}
.editor-section::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  background: linear-gradient(to left, var(--app-scroll-shade), transparent);
  pointer-events: none;
  z-index: 10;
}


.editor-pane {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.editor-pane::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 7px;
  background: linear-gradient(to top, var(--app-scroll-shade), transparent);
  pointer-events: none;
  z-index: 10;
}

</style>
