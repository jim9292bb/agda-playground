<script>
import { onDestroy, tick, untrack } from 'svelte'

import { SPSC } from 'spsc'
// import { SplitPane } from '@rich_harris/svelte-split-pane'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'

import SplitPane from '$lib/components/SplitPane.svelte'
import AboutPanel from '$lib/components/AboutPanel.svelte'
import HeaderExamplePicker from '$lib/components/HeaderExamplePicker.svelte'
import AppSwitcher from '$lib/components/AppSwitcher.svelte'
import AlsControlCard from '$lib/components/AlsControlCard.svelte'
import GoalsPanel from '$lib/components/GoalsPanel.svelte'
import MessagesPanel from '$lib/components/MessagesPanel.svelte'
import SettingsPanel from '$lib/components/SettingsPanel.svelte'
import { AgdaController, deployProfiles, resolveProfileLibraries } from '$lib/controller.svelte'
import { myCodeMirrorTheme } from '$lib/codemirror/theme'
import { agdaInputMethod } from '$lib/codemirror/agda-input'
import { agdaSupport } from '$lib/agda'
import { getAgdaDocumentVersion, getAgdaGoals, mergeGoalInfos } from '$lib/agda/goal-state'
import { getGoalAtPosition, getGoalRangeById } from '$lib/agda/goals'
import { getAgdaShortcutContext } from '$lib/agda/shortcut-context'
import {
  runAgdaShortcut as runAgdaShortcutShared,
  runAgdaShortcutWithInputPrompt as runAgdaShortcutWithInputPromptShared,
} from '$lib/agda/run-shortcut'
import {
  advanceAgdaChord,
  agdaShortcutRegistry,
  chordStepsOf,
  createAgdaShortcutRegistry,
  displayKey,
  findAgdaShortcutById,
  formatAgdaShortcutHelpBinding,
  reservedChordSequences,
  validateAgdaShortcutOverrides,
} from '$lib/agda/shortcuts'
import { lookupChar, formatCodePoint } from '$lib/agda/input-lookup'
import {
  autoOneCommand,
  contextCommand,
  computeCommand,
  elaborateGiveCommand,
  giveCommand,
  goalTypeCommand,
  goalTypeContextCommand,
  goalTypeContextCheckCommand,
  goalTypeContextInferCommand,
  helperFunctionCommand,
  inferCommand,
  makeCaseCommand,
  moduleContentsCommand,
  moduleContentsToplevelCommand,
  refineCommand,
  searchAboutToplevelCommand,
  whyInScopeCommand,
  whyInScopeToplevelCommand,
} from '$lib/agda/commands'

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
const LS_GOALS_PANEL_POSITION_KEY = 'agda-playground.goals-panel-position.v1'
const agdaShortcutIds = new Set(agdaShortcutRegistry.map(shortcut => shortcut.id))

/** @returns {Record<string, string>} */
function loadShortcutOverrides() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LS_SHORTCUT_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === 'string')
    )
  } catch {
    return {}
  }
}

/** @returns {'bottom' | 'right'} */
function loadGoalsPanelPosition() {
  if (typeof localStorage === 'undefined') return 'bottom'
  return localStorage.getItem(LS_GOALS_PANEL_POSITION_KEY) === 'right' ? 'right' : 'bottom'
}

/**
 * @param {Record<string, string>} overrides
 * @returns {Record<string, string>}
 */
function cleanShortcutOverrides(overrides) {
  return Object.fromEntries(
    Object.entries(overrides)
      .map(([id, value]) => [id, value.trim()])
      .filter(([id, value]) => agdaShortcutIds.has(id) && value)
  )
}

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

let goalsPanelPosition = $state(loadGoalsPanelPosition())
// Mobile always stacks the editor above the right column regardless of this
// setting (see the editor snippet's orientation), so honoring 'right' there
// would be meaningless — force 'bottom' whenever the viewport is narrow,
// and restore the saved preference automatically once it widens again.
const effectiveGoalsPosition = $derived(isMobile ? 'bottom' : goalsPanelPosition)

/** @param {'bottom' | 'right'} pos */
function setGoalsPanelPosition(pos) {
  goalsPanelPosition = pos
  if (typeof localStorage !== 'undefined') localStorage.setItem(LS_GOALS_PANEL_POSITION_KEY, pos)
  commandsPanelVisible = false
}

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
 */
function runAgdaShortcut(label, view, command) {
  runAgdaShortcutShared({
    label, view, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    clearPendingGoal: clearPendingAgdaGoal,
    command,
  })
}

/**
 * @param {string} label
 * @param {EditorView} view
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>} command
 */
function runAgdaShortcutWithInputPrompt(label, view, command) {
  runAgdaShortcutWithInputPromptShared({
    label, view, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    clearPendingGoal: clearPendingAgdaGoal,
    command,
    onNeedsInput: openCommandInputPrompt,
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

/** @param {ReturnType<typeof getAgdaShortcutContext>} context */
function requireGoal(context) {
  if (!context.goal) throw new Error('Place the cursor inside a goal first.')
  return context.goal
}

/** @param {string} label */
function clearPendingAgdaGoal(label) {
  if (label === 'Case split' && agdaController.alsRouter) {
    agdaController.alsRouter.pendingCaseSplitGoal = undefined
  } else if ((label === 'Give' || label === 'Auto' || label === 'Elaborate and give') && agdaController.alsRouter) {
    agdaController.alsRouter.pendingGiveGoal = undefined
  }
}

/**
 * @param {string} label
 * @param {EditorView} view
 * @param {import('$lib/agda/shortcut-context').AgdaShortcutContext} context
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>} command
 */
function openCommandInputPrompt(label, view, context, command) {
  commandInputError = ''
  commandInputPrompt = {
    label,
    value: '',
    documentVersion: getAgdaDocumentVersion(view.state),
    command,
    context,
  }
  textboxContent += `${label}: enter command input in the Goals panel.\n`
  void tick().then(() => commandInputElement?.focus())
}

function cancelCommandInputPrompt() {
  const label = commandInputPrompt?.label
  commandInputPrompt = null
  if (label) textboxContent += `${label} cancelled.\n`
  agdaController.editorView?.focus()
}

function submitCommandInputPrompt() {
  void (async () => {
    const prompt = commandInputPrompt
    const view = agdaController.editorView
    if (!prompt || !view) return

    const input = prompt.value.trim()
    if (!input) {
      commandInputError = 'Enter an expression before submitting.'
      return
    }

    if (getAgdaDocumentVersion(view.state) !== prompt.documentVersion) {
      commandInputPrompt = null
      textboxContent += `${prompt.label} failed: Reload or retry because the editor changed while the prompt was open.\n`
      view.focus()
      return
    }

    commandInputError = ''
    commandInputPrompt = null
    try {
      textboxContent += `${prompt.label}...\n`
      const interaction = await prompt.command(prompt.context, input)
      if (interaction) await agdaController.runAgdaInteraction(interaction)
      textboxContent += `${prompt.label} finished.\n`
    } catch (err) {
      clearPendingAgdaGoal(prompt.label)
      textboxContent += `${prompt.label} failed: ${err instanceof Error ? err.message : String(err)}\n`
    } finally {
      view.focus()
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

function clearChordProgress() {
  chordProgress = []
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
  selectedMessageTab = 'queries'
}

/**
 * @param {import('$lib/agda/shortcuts').AgdaShortcutDefinition} shortcut
 * @param {EditorView} view
 */
function runAgdaShortcutDefinition(shortcut, view) {
  switch (shortcut.id) {
    case 'load':
      runLoadShortcut()
      break
    case 'next-goal':
      focusAdjacentGoal(view, 1)
      break
    case 'previous-goal':
      focusAdjacentGoal(view, -1)
      break
    case 'goal-type':
      runAgdaShortcut(shortcut.label, view, context => goalTypeCommand('Simplified', requireGoal(context)))
      break
    case 'context':
      runAgdaShortcut(shortcut.label, view, context => contextCommand('Simplified', requireGoal(context)))
      break
    case 'goal-type-context':
      runAgdaShortcut(shortcut.label, view, context => goalTypeContextCommand('Simplified', requireGoal(context)))
      break
    case 'goal-type-context-infer':
      runAgdaShortcut(shortcut.label, view, context => {
        const goal = requireGoal(context)
        if (!context.input.trim()) {
          return goalTypeContextCommand('Simplified', goal)
        }
        return goalTypeContextInferCommand('Simplified', goal, context.input)
      })
      break
    case 'goal-type-context-check':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) =>
        goalTypeContextCheckCommand('Simplified', requireGoal(context), input))
      break
    case 'search-about':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (_context, input) =>
        searchAboutToplevelCommand('Simplified', input))
      break
    case 'module-contents':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) => {
        const goal = context.goal
        return goal
          ? moduleContentsCommand('Simplified', goal, input)
          : moduleContentsToplevelCommand('Simplified', input)
      })
      break
    case 'why-in-scope':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) => {
        const goal = context.goal
        return goal
          ? whyInScopeCommand(goal, input)
          : whyInScopeToplevelCommand(input)
      })
      break
    case 'give':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingGiveGoal = goal
        }
        return giveCommand(goal, context.range, input)
      })
      break
    case 'refine':
      // Unlike Give/Elaborate-give/Why-in-scope, Refine's own Agda command
      // (Cmd_refine_or_intro) has meaningful behavior for *empty* content --
      // it falls back to "intro" (auto-introduce a constructor), succeeding
      // outright when the goal type has exactly one constructor. Always
      // sending (never prompting first, unlike runAgdaShortcutWithInputPrompt)
      // lets Agda's own IntroNotFound/IntroConstructorUnknown responses
      // surface instead of a client-side prompt overriding that behavior.
      runAgdaShortcut(shortcut.label, view, context => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingGiveGoal = goal
        }
        return refineCommand(goal, context.range, context.input)
      })
      break
    case 'auto':
      runAgdaShortcut(shortcut.label, view, context => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingGiveGoal = goal
        }
        return autoOneCommand('AsIs', goal, context.range, context.input)
      })
      break
    case 'elaborate-give':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingGiveGoal = goal
        }
        return elaborateGiveCommand('Simplified', goal, input)
      })
      break
    case 'helper-function':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) =>
        helperFunctionCommand('AsIs', requireGoal(context), input))
      break
    case 'case-split':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingCaseSplitGoal = goal
        }
        return makeCaseCommand(goal, context.range, input)
      })
      break
    case 'compute':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) =>
        computeCommand('DefaultCompute', requireGoal(context), input))
      break
    case 'infer':
      runAgdaShortcutWithInputPrompt(shortcut.label, view, (context, input) =>
        inferCommand('Simplified', requireGoal(context), input))
      break
  }
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

  const result = advanceAgdaChord(chordProgress, event, chordTable)

  if (result.status === 'no-match') {
    if (chordProgress.length === 0) return false
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

  clearChordProgress()
  if (result.id === '__unicode-lookup') {
    lookupUnicodeAtCursor(view)
  } else if (result.id === '__abort') {
    sendAbort()
  } else {
    const shortcut = findAgdaShortcutById(result.id, activeAgdaShortcutRegistry)
    if (shortcut) runAgdaShortcutDefinition(shortcut, view)
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
            textboxContent += e.value.message
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
  commandInputPrompt = null
  commandInputError = ''
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
  shortcutDrafts = { ...shortcutOverrides }
  shortcutOverrideMessage = ''
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
  }
  reader.readAsText(file)
  input.value = ''
}

/**
 * @param {string} id
 * @param {string} value
 */
function setShortcutDraft(id, value) {
  shortcutDrafts = { ...shortcutDrafts, [id]: value }
  shortcutOverrideMessage = ''
}

/** @param {string} id */
function clearShortcutDraft(id) {
  const next = { ...shortcutDrafts }
  delete next[id]
  shortcutDrafts = next
  shortcutOverrideMessage = ''
}

function saveShortcutOverrides() {
  const cleaned = cleanShortcutOverrides(shortcutDrafts)
  const validation = validateAgdaShortcutOverrides(cleaned)
  if (!validation.valid) {
    shortcutOverrideMessage = validation.errors.join(' ')
    return
  }

  shortcutOverrides = cleaned
  shortcutDrafts = { ...cleaned }
  localStorage.setItem(LS_SHORTCUT_OVERRIDES_KEY, JSON.stringify(cleaned))
  shortcutOverrideMessage = Object.keys(cleaned).length
    ? 'Shortcut overrides saved.'
    : 'Shortcut overrides cleared.'
}

function resetShortcutOverrides() {
  shortcutOverrides = {}
  shortcutDrafts = {}
  localStorage.removeItem(LS_SHORTCUT_OVERRIDES_KEY)
  shortcutOverrideMessage = 'Shortcut overrides reset to defaults.'
}


function sendAbort() {
  return /** @type {any} */(agdaController.lspClient).request('agda', {
    tag: 'CmdReq',
    contents: `IOTCM "/source.agda" NonInteractive Direct (Cmd_abort)`,
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
  commandInputPrompt = null
  commandInputError = ''
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

let textboxContent = $state('WIP')
let selectedExampleId = $state('cubical-prelude')
const initialShortcutOverrides = loadShortcutOverrides()
let goalInfos = $state(/** @type {{id: number | string, range?: string, type?: string, context?: string}[]} */([]))
let panelGoalInfos = $state(/** @type {{id: number | string, range?: string, type?: string, context?: string}[]} */([]))
let agdaDiagnostics = $state(/** @type {import('$lib/agda/diagnostics').AgdaDiagnostic[]} */([]))
let activeGoalId = $state(/** @type {number | string | null} */(null))
let activeGoalDetailRequestKey = $state('')
let activeGoalDetailStatus = $state(/** @type {'idle' | 'loading' | 'ready' | 'error'} */('idle'))
let activeGoalDetailError = $state('')
let selectedMessageTab = $state(/** @type {'log' | 'queries' | 'errors'} */('log'))
let commandsPanelVisible = $state(false)
let goalsSplitRatio = $state(0.65)
/** @type {HTMLElement | undefined} */
let editorPaneSectionEl = $state()

// Commands lives in the header (above the editor) regardless of Goals
// position, and its dropdown always overlays (CSS position: absolute)
// rather than squeezing the editor or Goals — just toggle visibility.
function toggleCommandsPanel() {
  commandsPanelVisible = !commandsPanelVisible
}
let settingsPanelVisible = $state(false)
let aboutPanelVisible = $state(false)
/** @type {HTMLInputElement} */
let fileInput
let shortcutOverrides = $state(initialShortcutOverrides)
let shortcutDrafts = $state({ ...initialShortcutOverrides })
let shortcutOverrideMessage = $state('')
let activeAgdaShortcutRegistry = $derived(createAgdaShortcutRegistry(shortcutOverrides))
let shortcutDraftValidation = $derived(validateAgdaShortcutOverrides(cleanShortcutOverrides(shortcutDrafts)))
let chordTable = $derived([
  ...reservedChordSequences,
  ...activeAgdaShortcutRegistry.flatMap(shortcut =>
    shortcut.bindings
      .filter(binding => binding.kind === 'chord')
      .map(binding => ({ id: shortcut.id, steps: chordStepsOf(binding) }))),
])
let commandInputPrompt = $state(/** @type {null | {
  label: string,
  value: string,
  documentVersion: number,
  context: import('$lib/agda/shortcut-context').AgdaShortcutContext,
  command: (context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>,
}} */(null))
let commandInputError = $state('')
/** @type {HTMLInputElement | undefined} */
let commandInputElement = $state(/** @type {HTMLInputElement | undefined} */(undefined))

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
<SplitPane {orientation} position={.6} style="--divider-min-position: 25%; --divider-max-position: 90%;">
  {#snippet start()}
  <section class="editor-section">
    <header class="header">
      <div class="header-left">
        <span class="header-title">Agda Playground</span>
        <HeaderExamplePicker examples={scratchpadExamples} {selectedExampleId} onSelect={selectScratchpadExample} />
        <AppSwitcher current="playground" />
      </div>
      <div class="header-actions">
        <div class="header-commands-wrap">
          <button
            type="button"
            class="header-action-btn commands-panel-toggle"
            aria-expanded={commandsPanelVisible}
            aria-controls="commands-panel"
            onclick={toggleCommandsPanel}>
            Commands
            <svg class="header-dropdown-arrow" class:open={commandsPanelVisible} viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
          {#if commandsPanelVisible}
            <div id="commands-panel" class="commands-panel" aria-label="Agda commands">
              {#each activeAgdaShortcutRegistry as shortcut (shortcut.id)}
                <button
                  type="button"
                  class="command-button"
                  onclick={() => {
                    if (agdaController.editorView) {
                      runAgdaShortcutDefinition(shortcut, agdaController.editorView)
                      agdaController.editorView.focus()
                    }
                  }}>
                  {formatAgdaShortcutHelpBinding(shortcut)}
                </button>
              {/each}
            </div>
            <div class="header-menu-backdrop" role="presentation" onclick={() => { commandsPanelVisible = false }}></div>
          {/if}
        </div>
        <button type="button" class="header-action-btn" onclick={copyEditorCode}>Copy</button>
        <button type="button" class="header-action-btn" onclick={() => fileInput.click()}>Open</button>
        <button type="button" class="header-action-btn" onclick={exportAgdaFile}>Export</button>
      </div>
    </header>
    <SplitPane
      class={effectiveGoalsPosition === 'bottom' ? 'editor-goals-splitter' : 'editor-goals-splitter goals-collapsed'}
      orientation="vertical"
      bind:ratio={goalsSplitRatio}
      style="--divider-min-position: 35%; --divider-max-position: 92%;">
      {#snippet start()}
      <section class="editor-pane" bind:this={editorPaneSectionEl}>
        <div class="editor-wrap">
          <div class="container" {@attach codeMirror}></div>
          {#if chordProgress.length > 0}
            <div class="chord-hint" aria-live="polite" aria-label="Waiting for next chord key">
              {chordProgress.map(step => `C-${displayKey(step.key)}`).join(' ')}
            </div>
          {/if}
        </div>
      </section>
      {/snippet}
      {#snippet end()}
        {#if effectiveGoalsPosition === 'bottom'}
          <GoalsPanel
            position={effectiveGoalsPosition}
            {commandInputPrompt}
            {commandInputError}
            {panelGoalInfos}
            {activeGoalId}
            {activeGoalDetailStatus}
            {activeGoalDetailError}
            bind:commandInputElement
            onSubmitCommandInput={submitCommandInputPrompt}
            onCancelCommandInput={cancelCommandInputPrompt}
            onFocusGoal={focusGoal}
          />
        {/if}
      {/snippet}
    </SplitPane>
  </section>
  {/snippet}
  {#snippet end()}
  <section class="right-column">
    {#if effectiveGoalsPosition === 'right'}
      <div class="right-column-fixed">
        <section class="info-section">
          <AlsControlCard {agdaController} {deployProfiles} {onDeploymentProfileChange} onToggleCommands={toggleCommandsPanel} onOpenAbout={() => { aboutPanelVisible = true }} onOpenSettings={openSettingsPanel} />
        </section>
        <section class="output-section">
          <div class="right-goals-stack">
            <GoalsPanel
              position={effectiveGoalsPosition}
              {commandInputPrompt}
              {commandInputError}
              {panelGoalInfos}
              {activeGoalId}
              {activeGoalDetailStatus}
              {activeGoalDetailError}
              bind:commandInputElement
              onSubmitCommandInput={submitCommandInputPrompt}
              onCancelCommandInput={cancelCommandInputPrompt}
              onFocusGoal={focusGoal}
            />
            <MessagesPanel position={effectiveGoalsPosition} {agdaController} {textboxContent} {agdaDiagnostics} bind:selectedMessageTab />
          </div>
        </section>
      </div>
    {:else}
      <SplitPane class="right-column-splitter" orientation="vertical" position={.65}>
        {#snippet start()}
        <section class="info-section">
          <AlsControlCard {agdaController} {deployProfiles} {onDeploymentProfileChange} onToggleCommands={toggleCommandsPanel} onOpenAbout={() => { aboutPanelVisible = true }} onOpenSettings={openSettingsPanel} />
        </section>
        {/snippet}
        {#snippet end()}
        <section class="output-section">
          <MessagesPanel position={effectiveGoalsPosition} {agdaController} {textboxContent} {agdaDiagnostics} bind:selectedMessageTab />
        </section>
        {/snippet}
      </SplitPane>
    {/if}
  </section>
  {/snippet}
</SplitPane>
<SettingsPanel
  visible={settingsPanelVisible}
  onClose={closeSettingsPanel}
  {isMobile}
  {goalsPanelPosition}
  onSetGoalsPanelPosition={setGoalsPanelPosition}
  {agdaController}
  {deployProfiles}
  {runtimeSummary}
  {shortcutDrafts}
  {shortcutDraftValidation}
  {shortcutOverrideMessage}
  {activeAgdaShortcutRegistry}
  onSaveShortcutOverrides={saveShortcutOverrides}
  onResetShortcutOverrides={resetShortcutOverrides}
  onSetShortcutDraft={setShortcutDraft}
  onClearShortcutDraft={clearShortcutDraft}
/>
<AboutPanel bind:visible={aboutPanelVisible} {runtimeSummary} />
{/snippet}




<input
  bind:this={fileInput}
  type="file"
  accept=".agda,.lagda,.lagda.md"
  class="sr-only"
  onchange={openAgdaFile}>

<div
  bind:clientWidth={width} style="height: 100%; background: var(--quiet-neutral-fill-softer)">
  {@render editor(isMobile ? 'vertical' : 'horizontal')}
</div>

<style>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px;
  background: var(--quiet-neutral-fill-softer);
  border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-title {
  color: #1f2937;
  letter-spacing: 1px;
  font-size: 1rem;
  font-family: monospace;
  white-space: nowrap;
}

.header-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-action-btn {
  padding: 4px 10px;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  background: var(--quiet-neutral-fill);
  color: #374151;
  font: inherit;
  font-size: .82rem;
  cursor: pointer;
}

.header-action-btn:hover {
  border-color: var(--quiet-primary-stroke-soft);
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, var(--quiet-neutral-fill));
  color: var(--quiet-primary-text, #3b3aab);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}

.commands-panel-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-dropdown-arrow {
  display: inline-block;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.header-dropdown-arrow.open {
  transform: rotate(180deg);
}

/* Invisible full-viewport click-catcher so opening the Commands dropdown
   and then clicking anywhere outside it closes it, not just re-clicking
   the toggle button. Sits below the dropdown's own z-index (200) but
   above everything else on the page. HeaderExamplePicker.svelte has an
   identical duplicate for its own dropdown. */
.header-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: transparent;
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
  color: var(--color-text, #111);
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer, #e8e8e8) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--quiet-neutral-border, #bbb) 70%, transparent);
  border-radius: 4px;
  padding: 2px 7px;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.04em;
}

:global(.split-pane) {
  --divider-width: 1px;
  --divider-draggable-area: 13px;
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
  background: linear-gradient(to left, rgba(0, 0, 0, 0.09), transparent);
  pointer-events: none;
  z-index: 10;
}

:global(.editor-goals-splitter) {
  flex: 1 1;
  min-height: 0;
}

/* editor-goals-splitter stays mounted in both Goals positions (so
   .container/{@attach codeMirror} never moves between template branches —
   see LS_GOALS_PANEL_POSITION_KEY) and just collapses visually instead of
   being conditionally removed. Goals always lives in end(), the editor in
   start() — collapsing hides end(), expands start(). Unlike the editor,
   the right column has no CodeMirror-style state to lose, so its own
   Goals/Commands/Messages arrangement is just plain conditional markup
   (see the right-goals-stack block below) rather than needing this
   mount-and-collapse trick. */
:global(.editor-goals-splitter.goals-collapsed .split-divider),
:global(.editor-goals-splitter.goals-collapsed .split-end) {
  display: none;
}
:global(.editor-goals-splitter.goals-collapsed .split-start) {
  /* SplitPane.svelte sets an inline height on .split-start, so a plain
     class rule alone wouldn't win. */
  height: 100% !important;
}

.editor-pane {
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
  background: linear-gradient(to top, rgba(0, 0, 0, 0.07), transparent);
  pointer-events: none;
  z-index: 10;
}

.output-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: -1px;
}

.info-section {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.output-section {
  min-height: 0;
}

/* Goals docked to 'right': the whole right column becomes a fixed,
   non-resizable stack (control-card, then Commands/Goals/Messages) instead
   of the draggable right-column-splitter used for 'bottom' — no divider
   between info-section and output-section here. */
.right-column-fixed {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.right-column-fixed > .info-section {
  flex: none;
}
.right-column-fixed > .output-section {
  flex: 1 1;
  min-height: 0;
}

/* Goals docked to 'right': Goals and Messages stack as two fixed-size
   cards (no drag-resizing between them, unlike editor-goals-splitter).
   Each panel's own sizing/chrome (flex ratio, outlined-box style, header
   color) is handled internally via its `position` prop — GoalsPanel.svelte
   and MessagesPanel.svelte — since a parent's scoped CSS can't reach into
   a child component's own root element. Commands lives in the header
   above the editor regardless of Goals position. */
.right-goals-stack {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

/* Commands lives in the header above the editor regardless of Goals
   position — its dropdown always overlays (anchored under the header
   button) instead of squeezing the editor or Goals. */
.header-commands-wrap {
  position: relative;
}

.commands-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 200;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: min(420px, calc(100vw - 24px));
  max-height: 260px;
  overflow-y: auto;
  padding: 8px;
  background: var(--quiet-neutral-fill-softer);
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .1);
}

.command-button {
  background: var(--quiet-neutral-fill);
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 3px 8px;
  text-align: center;
  font-family: JuliaMono, monospace;
  font-size: .82rem;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 3px;
}

.command-button:hover,
.command-button:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, transparent);
}


</style>
