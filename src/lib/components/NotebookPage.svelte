<script>
import { onDestroy, tick, untrack } from 'svelte'

import { SPSC } from 'spsc'
// import { SplitPane } from '@rich_harris/svelte-split-pane'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'

import SplitPane from '$lib/components/SplitPane.svelte'
import LiterateCellEditor from '$lib/components/LiterateCellEditor.svelte'
import AboutPanel from '$lib/components/AboutPanel.svelte'
import AppHeader from '$lib/components/AppHeader.svelte'
import AgdaSidePanel from '$lib/components/AgdaSidePanel.svelte'
import { MobilePanelState } from '$lib/mobile-panel-state.svelte'
import { loadSplitRatio, saveSplitRatio } from '$lib/split-ratio'
import SettingsPanel from '$lib/components/SettingsPanel.svelte'
import { AgdaController, deployProfiles, resolveProfileLibraries } from '$lib/controller.svelte'
import { myCodeMirrorTheme, autoColorScheme } from '$lib/codemirror/theme'
import { agdaInputMethod } from '$lib/codemirror/agda-input'
import { agdaSupport } from '$lib/agda'
import { agdaDarkSchemeFromEmacs, agdaLightSchemeFromEmacs } from '$lib/agda/color-scheme'
import { agdaGoalState, getAgdaDocumentVersion, getAgdaGoals, mergeGoalInfos } from '$lib/agda/goal-state'
import { highlightState } from '$lib/agda/highlight'
import { getGoalAtPosition, getGoalRangeById } from '$lib/agda/goals'
import {
  runAgdaShortcut as runAgdaShortcutShared,
  runAgdaShortcutWithInputPrompt as runAgdaShortcutWithInputPromptShared,
} from '$lib/agda/run-shortcut'
import { parseLiterateBlocks } from '$lib/agda/literate-blocks'
import {
  createMarkdownCell,
  createCodeCell,
  assembleDocument,
  computeCellContentOffsets,
  computeCellWrapperOffsets,
  cellOffsetAtPos,
  cellsFromParsedBlocks,
} from '$lib/agda/literate-cells'
import {
  fromCellSync,
  translateCellChangesToGlobal,
  translateGlobalChangesToCells,
  cellPositionToGlobal,
  globalPositionToCell,
  projectGoalsToCells,
  projectHighlightToCells,
  setCellGoalDecorations,
  setCellHighlightDecorations,
  cellDecorationOverlays,
} from '$lib/codemirror/literate-cell-sync'
import { hoverTooltipsForCell } from '$lib/codemirror/lsp-hover'
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
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// The whole N-EditorView notebook app, shared by /literate and /plfa. Only
// what genuinely differs between those two routes comes in as props: the
// header picker (examples vs. PLFA chapters) is a snippet the route renders
// with its own selection state, and the route drives content changes through
// the exported `loadSource()` -- when the notebook replaces its document on
// its own (Open file), `onSourceReplaced` tells the route to drop that
// selection. All per-route persistence keys are derived from
// `storageNamespace` and `sourceFileName`, which must stay exactly what each
// route used before this component existed -- changing either silently orphans
// users' saved documents, shortcut overrides, and Goals panel position.
/** @type {{
 * title: string,
 * appSwitcherCurrent: 'notebook' | 'plfa',
 * storageNamespace: string,
 * sourceFileName: string,
 * defaultSource: string,
 * initialProfileLabel?: string,
 * picker?: import('svelte').Snippet,
 * onSourceReplaced?: () => void,
 * }} */
let {
  title,
  appSwitcherCurrent,
  storageNamespace,
  sourceFileName,
  defaultSource,
  initialProfileLabel,
  picker,
  onSourceReplaced,
} = $props()

// Mount-time configuration: which Agda file, storage slot, starting content and
// profile this notebook instance owns. Read exactly once, deliberately
// non-reactively -- swapping them on a live instance isn't meaningful (the ALS
// worker, hidden view and persisted document are all already bound to them).
const initialConfig = untrack(() => ({
  sourceFileName,
  storageNamespace,
  defaultSource,
  initialProfileLabel,
}))

const markdownRenderer = new MarkdownIt().use(texmath, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { throwOnError: false },
})

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
  sourceFileName: initialConfig.sourceFileName,
})
agdaController.currentFilePath = `/${initialConfig.sourceFileName}`
// Must run before the effect below starts the ALS worker, so the worker boots
// straight into this profile instead of starting on the default one first.
if (initialConfig.initialProfileLabel) {
  agdaController.selectedProfileLabel = initialConfig.initialProfileLabel
}

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

const LS_SHORTCUT_OVERRIDES_KEY = `agda-playground-${initialConfig.storageNamespace}.shortcut-overrides.v1`
const LS_PANEL_SPLIT_KEY = `agda-playground-${initialConfig.storageNamespace}.goals-messages-split.v1`
const LS_WORKSPACE_SPLIT_KEY = `agda-playground-${initialConfig.storageNamespace}.workspace-split.v1`

/** @param {string} source @returns {import('$lib/agda/literate-cells').LiterateCell[]} */
function cellsFromSource(source) {
  return cellsFromParsedBlocks(source, parseLiterateBlocks(source))
}

let width = $state(0)
let isMobile = $derived(width < 540)



// --- Cell model -------------------------------------------------------
//
// The document is an ordered array of markdown/code cells, each with its
// own real, visible CodeMirror EditorView (Jupyter-style) -- see
// literate-cells.js and literate-cell-sync.js for the underlying model.
// `hiddenView` holds the one logical assembled `.lagda.md` document and is
// what agdaController.editorView points to: every existing Agda
// interaction module (goal-state.js, highlight.js, handlers.js,
// editor-mutations.js, shortcut-context.js, goals.js, ranges.js,
// offsets.js) keeps working against it completely unmodified, since from
// their point of view it's just "the one EditorView", exactly as before —
// it's simply never mounted into the page's DOM. `cellViews` is the live
// registry of each cell's own mounted EditorView, populated/cleared by
// each cell's own mount/destroy attachment below.

let cells = $state(cellsFromSource(localStorage.getItem(agdaController.docStorageKey) ?? initialConfig.defaultSource))
/** @type {string | null} */
let activeCellId = $state(null)
// Plain (not SvelteMap) intentionally -- a live registry of mounted
// EditorView instances, mutated imperatively by each cell's own
// mount/destroy attachment. Never meant to drive Svelte reactivity itself
// (the reactive source of truth is the `cells` array); Svelte's own
// reactivity rule doesn't apply here.
/** @type {Map<string, EditorView>} */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const cellViews = new Map()

/** @param {import('@codemirror/view').ViewUpdate} update */
function hiddenViewUpdateListener(update) {
  const isSyncEcho = update.transactions.some(tr => tr.annotation(fromCellSync))

  if (update.docChanged && !isSyncEcho) {
    const preOffsets = computeCellContentOffsets(cells)
    const byCell = translateGlobalChangesToCells(preOffsets, update.changes)
    for (const [cellId, specs] of byCell) {
      const view = cellViews.get(cellId)
      if (view && specs.length) view.dispatch({ changes: specs, annotations: fromCellSync.of(true) })
    }
  }

  const goalEffects = update.transactions.some(tr => tr.effects.length > 0)
  if (update.selectionSet || update.docChanged || goalEffects) {
    syncGoalPanel(update.state)
  }

  const goalsChanged = update.startState.field(agdaGoalState) !== update.state.field(agdaGoalState)
  const highlightChanged = update.startState.field(highlightState) !== update.state.field(highlightState)
  if (goalsChanged || highlightChanged || update.docChanged) {
    const offsets = computeCellContentOffsets(cells)
    if (goalsChanged || update.docChanged) {
      const projected = projectGoalsToCells(update.state, offsets)
      for (const [cellId, decos] of projected) {
        cellViews.get(cellId)?.dispatch({ effects: setCellGoalDecorations.of(decos) })
      }
    }
    if (highlightChanged || update.docChanged) {
      const projected = projectHighlightToCells(update.state, offsets)
      for (const [cellId, decos] of projected) {
        cellViews.get(cellId)?.dispatch({ effects: setCellHighlightDecorations.of(decos) })
      }
    }
  }
}

const hiddenView = new EditorView({
  state: EditorState.create({
    // Seeds the hidden view's initial content once at setup -- not meant to
    // be a live/reactive binding to `cells` (which is why this is wrapped
    // in untrack()); the sync layer keeps the two in step from here on.
    doc: untrack(() => assembleDocument(cells)),
    extensions: [
      agdaSupport(),
      agdaController.lspClientCompartment.of([]),
      EditorView.updateListener.of(hiddenViewUpdateListener),
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
      }),
    ],
  }),
})
agdaController.connectEditorView(hiddenView)
agdaController.onJumpToError = position => focusGlobalPosition(position)

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
hiddenView.dom.addEventListener('agda-reload-needed', reloadAfterAgdaEdit)

onDestroy(() => {
  agdaController.terminateALSWASM()
  hiddenView.dom.removeEventListener('agda-reload-needed', reloadAfterAgdaEdit)
  hiddenView.destroy()
})

const basicTheme = EditorView.theme({
  // JuliaMono's glyph metrics (x-height, advance width) run noticeably
  // larger than the typical code-editor monospace stack at the same
  // nominal font-size -- 14px here reads roughly like 16px does in e.g.
  // PLFA's rendered Agda source, confirmed by side-by-side screenshot
  // comparison rather than by matching the CSS number.
  '&': {
    fontSize: '14px',
  },
  '.cm-panels': {
    // FIXME: should decouple from this extension
    marginRight: '-4px',
    paddingRight: '4px',
  },
  '.cm-scroller': {
    overscrollBehavior: 'contain',
  },
  // Line numbers read as noise against block-structured prose+code; each
  // cell's own wrapping box (see .literate-cell CSS below) is the primary
  // way to orient within the document here instead.
  '.cm-gutters': {
    display: 'none',
  },
  // basicSetup's highlightActiveLine highlights whichever line holds this
  // view's own selection regardless of DOM focus -- fine for a single
  // editor, but with N independent cell EditorViews every cell keeps its
  // own selection, so every cell would show a highlighted line permanently
  // even when some other cell is the one actually focused. Only show it on
  // the cell that currently has focus. `&` here resolves to the theme's own
  // root selector (the .cm-editor element itself) -- writing `.cm-editor`
  // instead would ask CodeMirror to scope this rule to a *descendant* of
  // the editor root, which never matches since .cm-editor is that root.
  '&:not(.cm-focused) .cm-activeLine': {
    backgroundColor: 'transparent',
  },
})

/**
 * Truncates the assembled document to the code block containing the active
 * cell before syncing, so any command run from cell N only sees cells
 * 1..N -- the core literate-programming behavior.
 * syncTruncatedSourceFileToDrive skips the actual reload when that exact
 * prefix is already loaded, so running several commands in a row inside
 * the same cell doesn't reload on every single one.
 */
async function literatePresync() {
  // Uses computeCellWrapperOffsets (cells-array-based), not
  // parseLiterateBlocks(hiddenView's text), for the same reason as
  // insertCellAfterActive/deleteCurrentBlock above: parseLiterateBlocks
  // inserts an extra (non-zero-length) markdown block for the blank line
  // between any two adjacent code cells with no markdown between them --
  // confirmed empirically to silently truncate right before the *second*
  // of two consecutive code cells, no matter which one was actually
  // active, since blocks[idx] no longer lines up with cells[idx] once that
  // extra block exists.
  const blocks = computeCellWrapperOffsets(cells)
  const idx = cells.findIndex(c => c.id === activeCellId)
  const blockIndex = idx >= 0 ? idx : blocks.length - 1
  await agdaController.syncTruncatedSourceFileToDrive(hiddenView, blocks, blockIndex)
}

/**
 * @param {string} label
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext) => string | Promise<void>} command
 * @param {import('$lib/agda/run-shortcut').AgdaShortcutHooks} [hooks]
 */
function runAgdaShortcut(label, command, hooks) {
  runAgdaShortcutShared({
    label, view: hiddenView, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    hooks,
    presync: literatePresync,
    command,
  })
}

/**
 * @param {string} label
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>} command
 * @param {import('$lib/agda/run-shortcut').AgdaShortcutHooks} [hooks]
 */
function runAgdaShortcutWithInputPrompt(label, command, hooks) {
  runAgdaShortcutWithInputPromptShared({
    label, view: hiddenView, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    hooks,
    presync: literatePresync,
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

/** Inserts a new cell right after the active cell (or at the end). */
function insertCellAfterActive(/** @type {import('$lib/agda/literate-cells').LiterateCell} */ newCell, /** @type {boolean} */ enterEditMode = false) {
  const idx = cells.findIndex(c => c.id === activeCellId)
  const insertAt = idx >= 0 ? idx + 1 : cells.length

  // Structural inserts/deletes must sync into hiddenView's own document
  // immediately -- cellSyncExtensions' per-cell listeners only replay
  // *content* edits inside an already-present cell, never a brand new
  // cell's own fence-wrapped span, so without this hiddenView would stay
  // silently out of sync with `cells` until some unrelated edit forced a
  // resync (confirmed empirically: selection/edit sync into a freshly
  // inserted cell threw "Selection points outside of document"). Uses
  // computeCellWrapperOffsets (cells-array-based), not
  // parseLiterateBlocks(hiddenView's text) -- the latter's own
  // trailing-blank-markdown-block handling doesn't line up 1:1 with
  // `cells` and silently corrupted an insert positioned after the last
  // cell (confirmed empirically: it landed one character short of the end
  // of the document, splitting the closing fence's own newline).
  const wrapperOffsets = computeCellWrapperOffsets(cells)
  const globalInsertAt = wrapperOffsets[insertAt]?.from ?? hiddenView.state.doc.length
  hiddenView.dispatch({
    changes: { from: globalInsertAt, to: globalInsertAt, insert: assembleDocument([newCell]) },
    annotations: fromCellSync.of(true),
  })

  cells.splice(insertAt, 0, newCell)
  activeCellId = newCell.id
  if (enterEditMode && newCell.type === 'markdown') editingMarkdownCellId = newCell.id
  void tick().then(() => cellViews.get(newCell.id)?.focus())
}

function insertMarkdownBlock() {
  insertCellAfterActive(createMarkdownCell('_new block_'), true)
}

function insertCodeBlock() {
  insertCellAfterActive(createCodeCell(''))
}

/**
 * Deletes the given cell (never the last remaining one). Takes an explicit
 * cellId rather than always acting on activeCellId -- the hover delete
 * button lets you delete a cell you're not currently focused on/in.
 * @param {string} cellId
 */
function deleteCell(cellId) {
  if (cells.length <= 1) return
  const idx = cells.findIndex(c => c.id === cellId)
  if (idx < 0) return

  const wrapperOffsets = computeCellWrapperOffsets(cells)
  const entry = wrapperOffsets[idx]
  if (entry) {
    hiddenView.dispatch({
      changes: { from: entry.from, to: entry.to, insert: '' },
      annotations: fromCellSync.of(true),
    })
  }

  const [removed] = cells.splice(idx, 1)
  cellViews.delete(removed.id)
  if (editingMarkdownCellId === removed.id) editingMarkdownCellId = null
  if (activeCellId === removed.id) {
    const nextIdx = Math.min(idx, cells.length - 1)
    activeCellId = cells[nextIdx]?.id ?? null
    void tick().then(() => cellViews.get(activeCellId ?? '')?.focus())
  }
}

function getActiveGoalId() {
  const state = hiddenView.state
  const docLength = state.doc.length
  const head = state.selection.main.head
  const previousPos = Math.max(0, head - 1)
  const nextPos = Math.min(docLength, head + 1)
  return (
    getGoalAtPosition(state, head) ??
    getGoalAtPosition(state, previousPos) ??
    getGoalAtPosition(state, nextPos)
  )?.id ?? null
}

/**
 * Focuses the given goal's own code cell, placing that cell's local cursor
 * just inside the goal -- the hidden view only ever tracks positions, it's
 * never itself visible, so every "jump to X" operation has to resolve
 * which cell to actually focus.
 * @param {number | string} goalId
 */
function focusGoal(goalId) {
  if (typeof goalId !== 'number') return
  const range = getGoalRangeById(hiddenView.state, goalId)
  if (!range) return
  focusGlobalPosition(Math.min(range.to, range.from + 3))
}

/**
 * @param {number} globalPos
 */
function focusGlobalPosition(globalPos) {
  const offsets = computeCellContentOffsets(cells)
  const entry = cellOffsetAtPos(offsets, globalPos)
  if (!entry) return
  const cellView = cellViews.get(entry.cellId)
  if (!cellView) return
  const localPos = Math.max(0, Math.min(entry.to - entry.from, globalPos - entry.from))
  activeCellId = entry.cellId
  hiddenView.dispatch({ selection: { anchor: globalPos } })
  cellView.dispatch({ selection: { anchor: localPos }, scrollIntoView: true, annotations: fromCellSync.of(true) })
  cellView.focus()
}

/** @param {1 | -1} direction */
function focusAdjacentGoal(direction) {
  const goals = getAgdaGoals(hiddenView.state)
  if (goals.length === 0) {
    textboxContent += 'Goal navigation failed: No goals.\n'
    return
  }

  const head = hiddenView.state.selection.main.head
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

/** @param {import('@codemirror/state').EditorState} state */
function syncGoalPanel(state) {
  panelGoalInfos = getAgdaGoals(state).map(goal => ({
    id: goal.id,
    range: goal.range,
    type: goal.type,
    context: goal.context,
  }))

  const active = getActiveGoalId()
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
      if (getAgdaDocumentVersion(hiddenView.state) !== documentVersion) break
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

function lookupUnicodeAtCursor() {
  const { from, to } = hiddenView.state.selection.main
  const text = hiddenView.state.sliceDoc(from, to > from ? to : from + 2)
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
 * @param {number} [prefixCount] pending `C-u` presses
 */
function runAgdaShortcutDefinition(shortcut, prefixCount = 0) {
  dispatchAgdaShortcut(shortcut, {
    load: runLoadShortcut,
    focusAdjacentGoal,
    run: runAgdaShortcut,
    runWithInputPrompt: runAgdaShortcutWithInputPrompt,
    getAlsRouter: () => agdaController.alsRouter,
  }, prefixCount)
}

const agdaKeymap = keymap.of(agdaShortcutRegistry.flatMap(shortcut =>
  shortcut.bindings
    .filter(binding => binding.kind === 'keymap')
    .map(binding => ({
      key: binding.key,
      run: () => {
        runAgdaShortcutDefinition(shortcut)
        return true
      },
    }))))

/**
 * Handles Agda/Emacs-style multi-key chords (e.g. Ctrl-c Ctrl-l, or
 * Ctrl-c Ctrl-x Ctrl-a for abort) before the browser can consume shortcuts
 * such as Ctrl-L. Advances chordProgress by one key per call against
 * chordTable (reserved sequences + the active shortcut registry).
 * @param {KeyboardEvent} event
 * @param {EditorView} view the focused cell's editor
 */
function handleAgdaChordKeydown(event, view) {
  if (event.isComposing) return false

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
    lookupUnicodeAtCursor()
  } else if (result.id === '__abort') {
    sendAbort()
  } else {
    const shortcut = findAgdaShortcutById(result.id, shortcutOverrideState.registry)
    if (shortcut) runAgdaShortcutDefinition(shortcut, prefixCount)
  }

  return true
}

const agdaChordKeymap = EditorView.domEventHandlers({
  keydown(event, view) {
    if (!view.hasFocus) return false
    return handleAgdaChordKeydown(event, view)
  },
})

// A window-level, capture-phase listener is needed *in addition to* each
// cell's own agdaChordKeymap domEventHandler: without it, some Agda chord
// keys collide with CodeMirror's own bundled default bindings (e.g.
// Ctrl-a's second step for "Auto" collides with basicSetup's selectAll) and
// lose, since those are wired at the normal bubble-phase precedence.
// Capturing first and calling stopImmediatePropagation() when handled lets
// Agda's own chord sequences win regardless. Resolves to whichever cell is
// actually focused right now (`cellViews.get(activeCellId)`, checked via
// the live `.hasFocus` rather than the tracked id alone).
$effect(() => {
  const captureAgdaChord = (/** @type {KeyboardEvent} */ event) => {
    if (!activeCellId) return
    const activeCell = cells.find(c => c.id === activeCellId)
    if (activeCell?.type !== 'code') return
    const activeView = cellViews.get(activeCellId)
    if (!activeView?.hasFocus) return
    if (handleAgdaChordKeydown(event, activeView)) event.stopImmediatePropagation()
  }
  window.addEventListener('keydown', captureAgdaChord, { capture: true })
  return () => window.removeEventListener('keydown', captureAgdaChord, { capture: true })
})

/**
 * Extension list shared by every cell's own visible EditorView -- fires the
 * bidirectional sync with hiddenView (see literate-cell-sync.js) on every
 * local doc/selection change, and tracks which cell is "active" (drives
 * literatePresync's block index and where goal navigation/shortcuts land).
 * @param {string} cellId
 * @param {'markdown' | 'code'} cellType
 */
function cellSyncExtensions(cellId, cellType) {
  return [
    EditorView.domEventHandlers({
      focus() {
        activeCellId = cellId
      },
    }),
    EditorView.updateListener.of(update => {
      const isSyncEcho = update.transactions.some(tr => tr.annotation(fromCellSync))

      if (update.docChanged) {
        const idx = cells.findIndex(c => c.id === cellId)
        if (idx < 0) return
        if (!isSyncEcho) {
          // Compute offsets and dispatch to hiddenView from cells[idx].text
          // *after* it's already updated to the post-edit content: dispatch()
          // is synchronous and re-enters hiddenViewUpdateListener before
          // returning, so if cells[idx].text were still stale at that point,
          // its own computeCellContentOffsets(cells) call would compute a
          // window shifted by this edit's length -- misaligning goal/
          // highlight projection for this cell and every cell after it for
          // that one pass.
          cells[idx].text = update.state.doc.toString()
          const preOffsets = computeCellContentOffsets(cells)
          const specs = translateCellChangesToGlobal(preOffsets[idx].from, update.changes)
          if (specs.length) hiddenView.dispatch({ changes: specs, annotations: fromCellSync.of(true) })
        } else {
          cells[idx].text = update.state.doc.toString()
        }
      }

      if (update.selectionSet) {
        const idx = cells.findIndex(c => c.id === cellId)
        if (idx < 0) return
        const offsets = computeCellContentOffsets(cells)
        const entry = offsets[idx]
        const sel = update.state.selection.main
        hiddenView.dispatch({
          selection: { anchor: entry.from + sel.anchor, head: entry.from + sel.head },
          annotations: fromCellSync.of(true),
        })
      }
    }),
    // Agda command shortcuts only make sense while a code cell is focused --
    // a markdown cell (even mid-edit) is prose, not something Load/Give/
    // Refine/etc. could ever act on.
    ...(cellType === 'code'
      ? [
          cellDecorationOverlays(),
          // The highlight/goal decorations projected onto this cell (see
          // hiddenViewUpdateListener) carry the same `.agda-*` classes
          // goals.js/highlight.js always use -- agdaSupport() on the hidden
          // view wires up the logic (goal-state.js/highlight.js StateFields)
          // but that view is never mounted, so its color-scheme theme never
          // reaches the DOM. Each code cell's own visible view needs its own
          // copy of the theme for those classes to actually render in color.
          autoColorScheme({
            dark: agdaDarkSchemeFromEmacs,
            light: agdaLightSchemeFromEmacs,
          }),
          agdaKeymap,
          agdaChordKeymap,
        ]
      : []),
  ]
}

/**
 * Hover position mapping for `hoverTooltipsForCell`, re-derived on every
 * hover (not cached) so it always reflects the current `cells` array --
 * mirrors the same `computeCellContentOffsets` lookup goal/highlight
 * projection already does, just for a single position instead of a
 * RangeSet. Returns null if this cell no longer exists (e.g. deleted).
 * @param {string} cellId
 */
function cellHoverMapping(cellId) {
  const offsets = computeCellContentOffsets(cells)
  const entry = offsets.find(o => o.cellId === cellId)
  if (!entry) return null
  return {
    hiddenView,
    toGlobal: (/** @type {number} */ localPos) => cellPositionToGlobal(entry, localPos),
    toLocal: (/** @type {number} */ globalPos) => {
      const resolved = globalPositionToCell(offsets, globalPos)
      return resolved && resolved.cellId === cellId ? resolved.localPos : null
    },
  }
}

/**
 * Full extension list for one cell's own visible EditorView. Rendering
 * (LiterateCellEditor.svelte) is a dedicated child component, not an
 * inline `{@attach}` inside the parent's `{#each cells as cell (cell.id)}`
 * block -- an inline attachment factory re-evaluates on every structural
 * change to the `cells` array (confirmed empirically: inserting one new
 * cell caused an *unrelated* existing cell's EditorView to tear down and
 * remount, discarding unsynced edits), since Svelte's `{@attach}` re-runs
 * as an effect tied to the surrounding reactive scope, not just when its
 * own returned value changes. A child component gives each cell its own
 * isolated reactive boundary instead.
 * @param {string} cellId
 * @param {'markdown' | 'code'} cellType
 */
function cellExtensions(cellId, cellType) {
  return [
    basicSetup,
    myCodeMirrorTheme(),
    basicTheme,
    // tabindex is explicit so a horizontally scrolling cell counts as
    // keyboard-reachable (axe scrollable-region-focusable).
    EditorView.contentAttributes.of({
      'aria-label': cellType === 'code' ? 'Agda code block' : 'Markdown text block',
      tabindex: '0',
    }),
    agdaInputMethod(),
    ...cellSyncExtensions(cellId, cellType),
    // Markdown cells aren't Agda source -- Agda's own hover response for a
    // position in one would be meaningless (it'd resolve to whatever
    // adjacent code cell that position happens to land nearest to in the
    // assembled document).
    ...(cellType === 'code' ? [hoverTooltipsForCell(() => cellHoverMapping(cellId))] : []),
    // basicSetup deliberately doesn't bind Tab to indentation (Tab moves
    // focus by default, for accessibility) -- opt in explicitly. Placed
    // last so any Agda Tab binding (agdaKeymap/agdaChordKeymap, above)
    // would win.
    keymap.of([indentWithTab]),
  ]
}

/**
 * @param {string} cellId
 * @param {import('@codemirror/view').EditorView} view
 */
function registerCellView(cellId, view) {
  cellViews.set(cellId, view)
}

/** @param {string} cellId */
function unregisterCellView(cellId) {
  cellViews.delete(cellId)
}

/** @type {string | null} */
let editingMarkdownCellId = $state(null)

/** @param {string} cellId */
function enterMarkdownEditMode(cellId) {
  editingMarkdownCellId = cellId
  activeCellId = cellId
  void tick().then(() => cellViews.get(cellId)?.focus())
}

function exitMarkdownEditMode() {
  editingMarkdownCellId = null
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
  hiddenView.dispatch({ effects: clearGoals.of() })
}

/**
 * Tears down every mounted cell view and rebuilds the cell array + hidden
 * view from `source`.
 * @param {string} source
 * @param {string} what what was loaded, for the log ("Example", "Chapter", "File")
 */
function replaceScratchpadSource(source, what) {
  for (const view of cellViews.values()) view.destroy()
  cellViews.clear()
  editingMarkdownCellId = null
  const nextCells = cellsFromSource(source)
  cells = nextCells
  activeCellId = null
  hiddenView.dispatch({
    changes: { from: 0, to: hiddenView.state.doc.length, insert: assembleDocument(nextCells) },
    selection: { anchor: 0 },
    annotations: fromCellSync.of(true),
  })
  localStorage.setItem(agdaController.docStorageKey, source)
  clearScratchpadInteractionState()
  textboxContent = `${what} loaded into editor. Click Load to type-check it.\n`
}

/**
 * Replaces the whole notebook with `source` -- the route-facing entry point
 * (examples picker, PLFA chapter picker, `?chapter=` deep links), reached via
 * `bind:this`.
 * @param {string} source
 * @param {string} [what] what is being loaded, for the log message
 */
export function loadSource(source, what = 'Example') {
  replaceScratchpadSource(source, what)
}

function openSettingsPanel() {
  shortcutOverrideState.beginEditing()
  settingsPanelVisible = true
}

function closeSettingsPanel() {
  settingsPanelVisible = false
  cellViews.get(activeCellId ?? '')?.focus()
}

function exportAgdaFile() {
  const text = assembleDocument(cells)
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'source.lagda.md'
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
    replaceScratchpadSource(text, 'File')
    onSourceReplaced?.()
  }
  reader.readAsText(file)
  input.value = ''
}

/** @param {string} id */
function runAgdaShortcutById(id) {
  const shortcut = findAgdaShortcutById(id, shortcutOverrideState.registry)
  if (shortcut) runAgdaShortcutDefinition(shortcut)
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

/**
 * Load implementation for C-c C-l, truncated to the active cell.
 * @param {number} blockIndex
 */
async function performLoad(blockIndex) {
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
  hiddenView.dispatch({ effects: clearGoals.of() })

  const prefetchFn = agdaController.backend?.prefetchAgdai?.bind(agdaController.backend)
  if (prefetchFn && agdaController.receivedNumericAgdaVersion) {
    triggerPrefetch(
      hiddenView.state.doc.toString(),
      prefetchFn,
      resolveProfileLibraries(agdaController.activeProfile),
      agdaController.receivedNumericAgdaVersion,
    )
  }

  try {
    // See literatePresync's comment: cells-array-based offsets, not
    // parseLiterateBlocks against the assembled text.
    const blocks = computeCellWrapperOffsets(cells)
    await agdaController.syncTruncatedSourceFileToDrive(hiddenView, blocks, blockIndex)
    syncAgdaDiagnostics()
    textboxContent += 'Load finished.\n'
  } catch (err) {
    syncAgdaDiagnostics()
    textboxContent += `Load failed: ${err instanceof Error ? err.message : String(err)}\n`
    throw err
  }
}

/** Loads only the cells up to and including the active one. */
async function loadAgdaFile() {
  const idx = cells.findIndex(c => c.id === activeCellId)
  await performLoad(idx >= 0 ? idx : cells.length - 1)
}

function syncAgdaDiagnostics() {
  agdaDiagnostics = [...(agdaController.alsRouter?.lastAgdaDiagnostics ?? [])]
}

let textboxContent = $state('')
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

/** Runs a command picked from the header's Commands menu, then hands focus back to the active cell. */
function runCommandFromMenu(/** @type {import('$lib/agda/shortcuts').AgdaShortcutDefinition} */ shortcut) {
  runAgdaShortcutDefinition(shortcut)
  cellViews.get(activeCellId ?? '')?.focus()
}

const commandsMenuFileActions = [
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
  getDocState: () => hiddenView.state,
  focusEditor: () => cellViews.get(activeCellId ?? '')?.focus(),
  appendLog: msg => textboxContent += msg,
})

$effect(() => {
  const goalId = activeGoalId
  const goal = panelGoalInfos.find(goal => goal.id === goalId)

  if (
    typeof goalId !== 'number' ||
    !goal ||
    goal.context !== undefined ||
    agdaController.alsWorkerStatus !== 'active' ||
    agdaController.iotcmStatus !== 'ready'
  ) {
    return
  }

  const documentVersion = getAgdaDocumentVersion(hiddenView.state)
  untrack(() => {
    void requestActiveGoalDetails(goalId, documentVersion)
  })
})

$effect(() => {
  if (autoFetchingGoalTypes) return
  if (panelGoalInfos.every(g => g.type !== undefined)) return
  if (agdaController.alsWorkerStatus !== 'active') return
  if (agdaController.iotcmStatus !== 'ready') return
  const documentVersion = getAgdaDocumentVersion(hiddenView.state)
  untrack(() => {
    void autoFetchGoalTypes(documentVersion)
  })
})
</script>

{#snippet editor(/** @type {'horizontal' | 'vertical'} */ orientation)}
<SplitPane
  {orientation}
  bind:ratio={() => (isMobile ? phoneSplit : desktopSplit), (value) => { if (isMobile) phoneSplit = value; else desktopSplit = value }}
  class={isMobile ? (mobilePanel.collapsed ? 'mobile-split collapsed' : 'mobile-split') : ''} dividerLabel="Resize notebook and Agda panel" style="--divider-min-position: 25%; --divider-max-position: 90%;">
  {#snippet start()}
  <section class="editor-section">
  <section class="editor-pane">
    <div class="editor-wrap">
      <div class="literate-cells" onclick={(e) => { if (e.target === e.currentTarget) activeCellId = null }}>
        {#each cells as cell (cell.id)}
          <div
            class="literate-cell"
            class:literate-cell-code={cell.type === 'code'}
            class:literate-cell-markdown={cell.type === 'markdown'}
            class:literate-cell-focused={cell.id === activeCellId}
          >
            {#if cells.length > 1}
              <button
                type="button"
                class="literate-cell-delete-btn"
                aria-label="Delete this block"
                title="Delete this block"
                onclick={() => deleteCell(cell.id)}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                  <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                  <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
              </button>
            {/if}
            {#if cell.type === 'markdown' && editingMarkdownCellId !== cell.id}
              <div class="literate-markdown-render" onclick={() => { activeCellId = cell.id }}>
                <!-- Rendering the user's own local document, not third-party/untrusted
                     content -- no server, no other users. This is the accepted trade-off
                     already documented in the original single-buffer implementation
                     (markdown-preview.js, now removed); unchanged here. -->
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                <div class="literate-markdown-content">{@html markdownRenderer.render(cell.text || '_empty block_')}</div>
                <button type="button" class="literate-markdown-edit-btn" aria-label="Edit this text block" onclick={() => enterMarkdownEditMode(cell.id)}>Edit</button>
              </div>
            {:else}
              <LiterateCellEditor
                getText={() => cell.text}
                extensions={cellExtensions(cell.id, cell.type)}
                onView={view => registerCellView(cell.id, view)}
                onDestroyed={() => unregisterCellView(cell.id)}
              />
              {#if cell.type === 'markdown'}
                <div class="literate-markdown-done-row">
                  <button type="button" class="literate-markdown-done-btn" onclick={exitMarkdownEditMode}>✓ Done</button>
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
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

<svelte:head>
  <title>{title}</title>
</svelte:head>

<main
  class="app-main"
  bind:clientWidth={width}>
  <AppHeader
    {title}
    current={appSwitcherCurrent}
    {picker}
    registry={shortcutOverrideState.registry}
    onRunCommand={runCommandFromMenu}
    fileActions={commandsMenuFileActions}
    activeGoalLabel={activeGoalId === null ? null : `?${activeGoalId}`}
    onOpenAbout={() => { aboutPanelVisible = true }}
    onOpenSettings={openSettingsPanel}
    compact={isMobile}>
    {#snippet actions()}
      <button type="button" class="header-action-btn" onclick={insertMarkdownBlock}>+ Markdown</button>
      <button type="button" class="header-action-btn" onclick={insertCodeBlock}>+ Code</button>
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
  background: var(--quiet-neutral-fill-softer);
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
  overflow-y: auto;
}

.literate-cells {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 8px 12px 40px;
}

.literate-cell {
  position: relative;
  /* 60px of side room on a wide pane, shrinking on a phone so prose isn't
     squeezed into a narrow column. */
  margin: 10px clamp(4px, 5vw, 60px);
  border-radius: 6px;
}

/* Top-right, like the markdown "Edit" button -- but this one lives on
   every cell type/state (code, markdown rendered, markdown editing),
   unlike Edit/Done which are markdown-only, so .literate-markdown-edit-btn
   is shifted further left (see its own rule below) to sit beside it
   without overlapping when both are present. */
.literate-cell-delete-btn {
  position: absolute;
  top: 2px;
  right: 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.1s ease;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--app-border-strong);
  background: var(--app-code-fill);
  cursor: pointer;
}

.literate-cell:hover .literate-cell-delete-btn {
  opacity: 1;
}

.literate-cell-code {
  background: var(--app-cell-focus-fill);
  border: 1px solid var(--app-cell-border);
  padding: 6px 0;
}

.literate-cell-markdown {
  background: var(--app-surface);
  border: 2px solid transparent;
}

/* The active cell (wherever a command/truncation would target) gets a
   visible focus ring, Jupyter-style. Markdown cells keep a transparent
   border at all times (rather than no border) so gaining the focus color
   doesn't shift layout. */
.literate-cell-code.literate-cell-focused {
  border-width: 2px;
  border-color: var(--app-cell-focus-border);
}

.literate-cell-markdown.literate-cell-focused {
  border-color: var(--app-cell-focus-border);
}

.literate-markdown-render {
  position: relative;
  padding: 4px 8px;
}

.literate-markdown-content {
  cursor: default;
}

.literate-markdown-content :global(h1),
.literate-markdown-content :global(h2),
.literate-markdown-content :global(h3) {
  margin: 0.4em 0;
}

.literate-markdown-content :global(p) {
  margin: 0.4em 0;
}

.literate-markdown-content :global(code) {
  font-family: JuliaMono, monospace;
  background: rgba(128, 128, 128, 0.15);
  padding: 0 3px;
  border-radius: 2px;
}

/* Fenced code blocks (```...```) render as <pre><code>...</code></pre> --
   give the block itself the background/padding/scroll so it isn't just a
   run of per-line inline-code chips, and clear the inline <code> styling
   underneath so it doesn't double up. */
.literate-markdown-content :global(pre) {
  background: rgba(128, 128, 128, 0.15);
  padding: 8px 10px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.4em 0;
}

.literate-markdown-content :global(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
}

.literate-markdown-edit-btn {
  position: absolute;
  top: 2px;
  /* Shifted left of .literate-cell-delete-btn's right:4px so the two sit
     side by side without overlapping. */
  right: 36px;
  opacity: 0;
  transition: opacity 0.1s ease;
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--app-border-strong);
  background: var(--app-code-fill);
  cursor: pointer;
}

.literate-markdown-render:hover .literate-markdown-edit-btn {
  opacity: 1;
}

.literate-markdown-done-row {
  display: flex;
  justify-content: flex-end;
  padding: 2px 8px;
}

.literate-markdown-done-btn {
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(70, 110, 255, 0.4);
  background: rgba(70, 110, 255, 0.08);
  cursor: pointer;
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

:global(.split-pane) {
  --divider-width: 1px;
  --divider-draggable-area: 13px;
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
