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
import HeaderExamplePicker from '$lib/components/HeaderExamplePicker.svelte'
import AlsControlCard from '$lib/components/AlsControlCard.svelte'
import GoalsPanel from '$lib/components/GoalsPanel.svelte'
import MessagesPanel from '$lib/components/MessagesPanel.svelte'
import SettingsPanel from '$lib/components/SettingsPanel.svelte'
import { AgdaController, deployProfiles, resolveProfileLibraries } from '$lib/controller.svelte'
import { myCodeMirrorTheme, autoColorScheme, prefersDarkTheme } from '$lib/codemirror/theme'
import { agdaInputMethod } from '$lib/codemirror/agda-input'
import { agdaSupport } from '$lib/agda'
import { agdaDarkSchemeFromEmacs, agdaLightSchemeFromEmacs } from '$lib/agda/color-scheme'
import { agdaGoalState, getAgdaDocumentVersion, getAgdaGoals, mergeGoalInfos } from '$lib/agda/goal-state'
import { highlightState } from '$lib/agda/highlight'
import { getGoalAtPosition, getGoalRangeById } from '$lib/agda/goals'
import { getAgdaShortcutContext } from '$lib/agda/shortcut-context'
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
  projectGoalsToCells,
  projectHighlightToCells,
  setCellGoalDecorations,
  setCellHighlightDecorations,
  cellDecorationOverlays,
} from '$lib/codemirror/literate-cell-sync'
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
import MarkdownIt from 'markdown-it'

const markdownRenderer = new MarkdownIt()

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
  sourceFileName: 'source.lagda.md',
})
agdaController.currentFilePath = '/source.lagda.md'

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

/** @param {string} code */
function wrapAsLiterate(code) {
  return `\`\`\`agda\n${code}\`\`\`\n`
}

const defaultSource = `# Agda Literate Playground

Edit this document as prose and \`\`\`agda\`\`\` code blocks. Running a command
while the cursor is in a code block only sends Agda everything up to and
including that block.

${wrapAsLiterate('{-# OPTIONS --cubical --guardedness #-}\n\nopen import Cubical.Foundations.Prelude\n')}`
const LS_SHORTCUT_OVERRIDES_KEY = 'agda-playground-literate.shortcut-overrides.v1'
const LS_GOALS_PANEL_POSITION_KEY = 'agda-playground-literate.goals-panel-position.v1'
const agdaShortcutIds = new Set(agdaShortcutRegistry.map(shortcut => shortcut.id))

/** @param {string} source @returns {import('$lib/agda/literate-cells').LiterateCell[]} */
function cellsFromSource(source) {
  return cellsFromParsedBlocks(source, parseLiterateBlocks(source))
}

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
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

one : N
one = s z
`),
  },
  {
    id: 'case-split-plus',
    label: 'Case split practice',
    description: 'Practice C-c C-c on the first argument.',
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
a + b = ?
`),
  },
  {
    id: 'auto-identity',
    label: 'Auto practice',
    description: 'Practice C-c C-a in a simple goal.',
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! !}
`),
  },
  {
    id: 'refine-elaborate',
    label: 'Refine / elaborate',
    description: 'Practice C-c C-r or C-c C-m with an expression.',
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! n !}
`),
  },
  {
    id: 'query-bool',
    label: 'Query practice',
    description: 'Practice infer, compute, module contents, and why-in-scope.',
    source: wrapAsLiterate(`open import Agda.Builtin.Bool

test : Bool
test = true
`),
  },
  {
    id: 'stdlib-nat',
    label: 'standard-library Nat',
    description: 'Minimal standard-library import.',
    source: wrapAsLiterate('open import Data.Nat.Base\n'),
  },
  {
    id: 'literate-blocks-demo',
    label: 'Multiple blocks demo',
    description: 'Two code blocks separated by prose — try running a command from the first block.',
    source: `# Two-block demo

First block:

${wrapAsLiterate('data N : Set where\n  z : N\n  s : N -> N\n')}
Second block (defines something the first block cannot see):

${wrapAsLiterate('one : N\none = s z\n')}`,
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

let cells = $state(cellsFromSource(localStorage.getItem(agdaController.docStorageKey) ?? defaultSource))
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
 */
function runAgdaShortcut(label, command) {
  runAgdaShortcutShared({
    label, view: hiddenView, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    clearPendingGoal: clearPendingAgdaGoal,
    presync: literatePresync,
    command,
  })
}

/**
 * @param {string} label
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>} command
 */
function runAgdaShortcutWithInputPrompt(label, command) {
  runAgdaShortcutWithInputPromptShared({
    label, view: hiddenView, agdaController, goalInfos,
    appendLog: msg => textboxContent += msg,
    clearPendingGoal: clearPendingAgdaGoal,
    presync: literatePresync,
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
 * Matches run-shortcut.js's shared `onNeedsInput` callback shape
 * (label, view, context, command) -- `view` isn't needed here (the active
 * cell is tracked via `activeCellId`/`cellViews` instead) but the parameter
 * stays so this satisfies the shared interface without changing it (also
 * used, unmodified, by the single-buffer `/` route).
 * @param {string} label
 * @param {import('@codemirror/view').EditorView} _view
 * @param {import('$lib/agda/shortcut-context').AgdaShortcutContext} context
 * @param {(context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>} command
 */
function openCommandInputPrompt(label, _view, context, command) {
  commandInputError = ''
  commandInputPrompt = {
    label,
    value: '',
    documentVersion: getAgdaDocumentVersion(hiddenView.state),
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
  cellViews.get(activeCellId ?? '')?.focus()
}

function submitCommandInputPrompt() {
  void (async () => {
    const prompt = commandInputPrompt
    if (!prompt) return

    const input = prompt.value.trim()
    if (!input) {
      commandInputError = 'Enter an expression before submitting.'
      return
    }

    if (getAgdaDocumentVersion(hiddenView.state) !== prompt.documentVersion) {
      commandInputPrompt = null
      textboxContent += `${prompt.label} failed: Reload or retry because the editor changed while the prompt was open.\n`
      cellViews.get(activeCellId ?? '')?.focus()
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
      cellViews.get(activeCellId ?? '')?.focus()
    }
  })()
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

function clearChordProgress() {
  chordProgress = []
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
  selectedMessageTab = 'queries'
}

/** @param {import('$lib/agda/shortcuts').AgdaShortcutDefinition} shortcut */
function runAgdaShortcutDefinition(shortcut) {
  switch (shortcut.id) {
    case 'load':
      runLoadShortcut()
      break
    case 'next-goal':
      focusAdjacentGoal(1)
      break
    case 'previous-goal':
      focusAdjacentGoal(-1)
      break
    case 'goal-type':
      runAgdaShortcut(shortcut.label, context => goalTypeCommand('Simplified', requireGoal(context)))
      break
    case 'context':
      runAgdaShortcut(shortcut.label, context => contextCommand('Simplified', requireGoal(context)))
      break
    case 'goal-type-context':
      runAgdaShortcut(shortcut.label, context => goalTypeContextCommand('Simplified', requireGoal(context)))
      break
    case 'goal-type-context-infer':
      runAgdaShortcut(shortcut.label, context => {
        const goal = requireGoal(context)
        if (!context.input.trim()) {
          return goalTypeContextCommand('Simplified', goal)
        }
        return goalTypeContextInferCommand('Simplified', goal, context.input)
      })
      break
    case 'goal-type-context-check':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) =>
        goalTypeContextCheckCommand('Simplified', requireGoal(context), input))
      break
    case 'search-about':
      runAgdaShortcutWithInputPrompt(shortcut.label, (_context, input) =>
        searchAboutToplevelCommand('Simplified', input))
      break
    case 'module-contents':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) => {
        const goal = context.goal
        return goal
          ? moduleContentsCommand('Simplified', goal, input)
          : moduleContentsToplevelCommand('Simplified', input)
      })
      break
    case 'why-in-scope':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) => {
        const goal = context.goal
        return goal
          ? whyInScopeCommand(goal, input)
          : whyInScopeToplevelCommand(input)
      })
      break
    case 'give':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingGiveGoal = goal
        }
        return giveCommand(goal, context.range, input)
      })
      break
    case 'refine':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) =>
        refineCommand(requireGoal(context), context.range, input))
      break
    case 'auto':
      runAgdaShortcut(shortcut.label, context => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingGiveGoal = goal
        }
        return autoOneCommand('AsIs', goal, context.range, context.input)
      })
      break
    case 'elaborate-give':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingGiveGoal = goal
        }
        return elaborateGiveCommand('Simplified', goal, input)
      })
      break
    case 'helper-function':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) =>
        helperFunctionCommand('AsIs', requireGoal(context), input))
      break
    case 'case-split':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) => {
        const goal = requireGoal(context)
        if (agdaController.alsRouter) {
          agdaController.alsRouter.pendingCaseSplitGoal = goal
        }
        return makeCaseCommand(goal, context.range, input)
      })
      break
    case 'compute':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) =>
        computeCommand('DefaultCompute', requireGoal(context), input))
      break
    case 'infer':
      runAgdaShortcutWithInputPrompt(shortcut.label, (context, input) =>
        inferCommand('Normalised', requireGoal(context), input))
      break
  }
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
 */
function handleAgdaChordKeydown(event) {
  if (event.isComposing) return false

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
    lookupUnicodeAtCursor()
  } else if (result.id === '__abort') {
    sendAbort()
  } else {
    const shortcut = findAgdaShortcutById(result.id, activeAgdaShortcutRegistry)
    if (shortcut) runAgdaShortcutDefinition(shortcut)
  }

  return true
}

const agdaChordKeymap = EditorView.domEventHandlers({
  keydown(event, view) {
    if (!view.hasFocus) return false
    return handleAgdaChordKeydown(event)
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
    if (handleAgdaChordKeydown(event)) event.stopImmediatePropagation()
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
          const preOffsets = computeCellContentOffsets(cells)
          const specs = translateCellChangesToGlobal(preOffsets[idx].from, update.changes)
          if (specs.length) hiddenView.dispatch({ changes: specs, annotations: fromCellSync.of(true) })
        }
        cells[idx].text = update.state.doc.toString()
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
            defaultDark: prefersDarkTheme(window),
          }),
          agdaKeymap,
          agdaChordKeymap,
        ]
      : []),
  ]
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
    agdaInputMethod(),
    ...cellSyncExtensions(cellId, cellType),
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
  if (activeCellId === null) activeCellId = cellId
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
  commandInputPrompt = null
  commandInputError = ''
  settingsPanelVisible = false
  hiddenView.dispatch({ effects: clearGoals.of() })
}

/**
 * Tears down every mounted cell view and rebuilds the cell array + hidden
 * view from `source`.
 * @param {string} source
 */
function replaceScratchpadSource(source) {
  for (const view of cellViews.values()) view.destroy()
  cellViews.clear()
  editingMarkdownCellId = null
  const nextCells = cellsFromSource(source)
  cells = nextCells
  activeCellId = nextCells[0]?.id ?? null
  hiddenView.dispatch({
    changes: { from: 0, to: hiddenView.state.doc.length, insert: assembleDocument(nextCells) },
    selection: { anchor: 0 },
    annotations: fromCellSync.of(true),
  })
  localStorage.setItem(agdaController.docStorageKey, source)
  clearScratchpadInteractionState()
  textboxContent = 'Example loaded into editor. Click Load to type-check it.\n'
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
    replaceScratchpadSource(text)
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
    contents: `IOTCM ${JSON.stringify(agdaController.currentFilePath)} NonInteractive Direct (Cmd_abort)`,
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
  commandInputPrompt = null
  commandInputError = ''
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
<SplitPane {orientation} position={.6} style="--divider-min-position: 25%; --divider-max-position: 90%;">
  {#snippet start()}
  <section class="editor-section">
    <header class="header">
      <div class="header-left">
        <span class="header-title">Agda Literate Playground</span>
        <HeaderExamplePicker examples={scratchpadExamples} {selectedExampleId} onSelect={selectScratchpadExample} />
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
                    runAgdaShortcutDefinition(shortcut)
                    cellViews.get(activeCellId ?? '')?.focus()
                  }}>
                  {formatAgdaShortcutHelpBinding(shortcut)}
                </button>
              {/each}
            </div>
            <div class="header-menu-backdrop" role="presentation" onclick={() => { commandsPanelVisible = false }}></div>
          {/if}
        </div>
        <button type="button" class="header-action-btn" onclick={insertMarkdownBlock}>+ Markdown</button>
        <button type="button" class="header-action-btn" onclick={insertCodeBlock}>+ Code</button>
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
          <div class="literate-cells">
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
                    onclick={() => deleteCell(cell.id)}>✕</button>
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

<svelte:head>
  <title>Agda Literate Playground</title>
</svelte:head>

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

.header-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.header-action-btn:disabled:hover {
  border-color: var(--quiet-neutral-stroke-softer);
  background: var(--quiet-neutral-fill);
  color: #374151;
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
  margin: 10px 0;
  border-radius: 6px;
}

/* Top-left, mirroring the markdown "Edit" button's top-right position
   (.literate-markdown-edit-btn) so the two never overlap -- this button
   lives on every cell type/state (code, markdown rendered, markdown
   editing), unlike Edit/Done which are markdown-only. */
.literate-cell-delete-btn {
  position: absolute;
  top: 2px;
  left: 4px;
  z-index: 1;
  opacity: 0;
  transition: opacity 0.1s ease;
  font-size: 0.8em;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #f6f8fa;
  cursor: pointer;
}

.literate-cell:hover .literate-cell-delete-btn {
  opacity: 1;
}

.literate-cell-code {
  background: #f0f8ff;
  border: 2px solid rgba(0, 0, 0, 0.15);
  padding: 6px 0;
}

.literate-cell-markdown {
  background: #ffffff;
  border: 2px solid transparent;
}

/* The active cell (wherever a command/truncation would target) gets a
   visible focus ring, Jupyter-style. Markdown cells keep a transparent
   border at all times (rather than no border) so gaining the focus color
   doesn't shift layout. */
.literate-cell-code.literate-cell-focused {
  border-color: var(--quiet-primary-stroke, #3b3aab);
}

.literate-cell-markdown.literate-cell-focused {
  border-color: var(--quiet-primary-stroke, #3b3aab);
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
  right: 4px;
  opacity: 0;
  transition: opacity 0.1s ease;
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #f6f8fa;
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

/* editor-goals-splitter stays mounted in both Goals positions (so the
   editor pane never moves between template branches — see
   LS_GOALS_PANEL_POSITION_KEY) and just collapses visually instead of
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
