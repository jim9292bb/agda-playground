import { Annotation, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import { EditorView, Decoration } from '@codemirror/view'
import { getAgdaGoals } from '$lib/agda/goal-state'
import { makeGoalMark } from '$lib/agda/goals'
import { highlightState } from '$lib/agda/highlight'

/** @import { ChangeSet, EditorState } from '@codemirror/state' */
/** @import { DecorationSet } from '@codemirror/view' */
/** @import { CellContentOffset } from '$lib/agda/literate-cells' */

/**
 * Pure translation logic for the Jupyter-style cell rewrite's bidirectional
 * sync between each cell's own (visible) EditorView and the hidden
 * "composite" EditorView that holds the one logical assembled `.lagda.md`
 * document -- the same document the entire existing Agda interaction
 * pipeline (goal-state.js, ranges.js, highlight.js, handlers.js,
 * editor-mutations.js, shortcut-context.js, goals.js) already assumes,
 * completely unmodified.
 *
 * Deliberately has NO dependency on a real `EditorView`/DOM (only
 * `EditorState`/`ChangeSet`/`Decoration`/`RangeSet`, all plain data) so it
 * can be unit-tested directly -- this project has no jsdom/happy-dom test
 * environment (browser-dependent behavior is verified with real
 * `agent-browser` runs, per its established convention), so anything that
 * needs a real mounted `EditorView` has to live in thin, separately
 * browser-verified glue code instead of here.
 */

/**
 * Tags a transaction as having been *replayed* by this sync layer (as
 * opposed to a genuine local edit) -- both sync directions check for this
 * to avoid replaying an echo of their own replay back and forth forever.
 * @type {import('@codemirror/state').AnnotationType<boolean>}
 */
export const fromCellSync = Annotation.define()

/**
 * Translates a cell's own local `ChangeSet` (from a transaction on that
 * cell's visible EditorView) into global-offset change specs to replay onto
 * the hidden composite view. `cellContentFrom` must be that cell's content
 * offset *before* this change (i.e. computed from the cells array as it
 * stood prior to applying `changes`) -- `changes.iterChanges` reports
 * positions relative to the pre-change document, which must line up with
 * the hidden view's current (not-yet-updated) document.
 * @param {number} cellContentFrom
 * @param {ChangeSet} changes
 * @returns {{from: number, to: number, insert: string}[]}
 */
export function translateCellChangesToGlobal(cellContentFrom, changes) {
  /** @type {{from: number, to: number, insert: string}[]} */
  const specs = []
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    specs.push({ from: cellContentFrom + fromA, to: cellContentFrom + toA, insert: inserted.toString() })
  })
  return specs
}

/**
 * Translates the hidden composite view's `ChangeSet` (from an
 * Agda-triggered mutation via editor-mutations.js -- Give/Refine/
 * MakeCase/etc, never a `fromCellSync` echo) into local change specs
 * grouped by the cell each change falls into. `cellOffsets` must be
 * `computeCellContentOffsets` computed from the cells array as it stood
 * *before* this transaction (matching `changes`' pre-change coordinate
 * space). Agda's own mutations are always scoped to a single goal, so each
 * individual change is expected to resolve to exactly one cell; a change
 * that doesn't cleanly fall within one cell's content range (e.g. it
 * touches a synthesized fence/separator) is dropped rather than corrupting
 * an unrelated cell -- this should never happen for real Agda mutations.
 * @param {CellContentOffset[]} cellOffsets
 * @param {ChangeSet} changes
 * @returns {Map<string, {from: number, to: number, insert: string}[]>}
 */
export function translateGlobalChangesToCells(cellOffsets, changes) {
  /** @type {Map<string, {from: number, to: number, insert: string}[]>} */
  const byCell = new Map()
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const entry = cellOffsets.find(o => fromA >= o.from && toA <= o.to)
    if (!entry) return
    const list = byCell.get(entry.cellId) ?? []
    list.push({ from: fromA - entry.from, to: toA - entry.from, insert: inserted.toString() })
    byCell.set(entry.cellId, list)
  })
  return byCell
}

/**
 * Clips a `RangeSet<Decoration>` to `[windowFrom, windowTo)` and re-anchors
 * it so `windowFrom` becomes local position 0 -- the core operation behind
 * projecting goal/highlighting decorations computed on the hidden
 * composite view down onto the one cell they visually belong in.
 * @param {import('@codemirror/state').RangeSet<Decoration>} rangeSet
 * @param {number} windowFrom
 * @param {number} windowTo
 * @returns {DecorationSet}
 */
export function projectRangeSetToWindow(rangeSet, windowFrom, windowTo) {
  /** @type {RangeSetBuilder<Decoration>} */
  const builder = new RangeSetBuilder()
  rangeSet.between(windowFrom, windowTo, (from, to, value) => {
    const clippedFrom = Math.max(from, windowFrom)
    const clippedTo = Math.min(to, windowTo)
    if (clippedFrom > clippedTo) return
    builder.add(clippedFrom - windowFrom, clippedTo - windowFrom, value)
  })
  return builder.finish()
}

/**
 * Projects the hidden composite view's current goals (`agdaGoalState`,
 * read via `getAgdaGoals` -- structured `{id, outerFrom, outerTo, ...}`
 * data, not a decoration set, per goal-state.js) into a per-cell local
 * `DecorationSet`, rebuilt with the same `makeGoalMark` goals.js itself
 * uses so a projected goal decoration is indistinguishable from one built
 * directly (same classes/attributes/id).
 * @param {EditorState} state hidden composite view's state
 * @param {CellContentOffset[]} cellOffsets computed from the *current* cells
 * @returns {Map<string, DecorationSet>}
 */
export function projectGoalsToCells(state, cellOffsets) {
  const goals = getAgdaGoals(state)
  /** @type {Map<string, DecorationSet>} */
  const result = new Map()
  for (const entry of cellOffsets) {
    if (entry.type !== 'code') continue
    /** @type {RangeSetBuilder<Decoration>} */
    const builder = new RangeSetBuilder()
    for (const goal of goals) {
      if (goal.outerFrom < entry.from || goal.outerTo > entry.to) continue
      builder.add(goal.outerFrom - entry.from, goal.outerTo - entry.from, makeGoalMark(goal.id))
    }
    result.set(entry.cellId, builder.finish())
  }
  return result
}

/**
 * Projects the hidden composite view's current token/other highlighting
 * (`highlightState`'s `aspects`/`otherAspects`) into per-cell local
 * `DecorationSet`s via `projectRangeSetToWindow`.
 * @param {EditorState} state hidden composite view's state
 * @param {CellContentOffset[]} cellOffsets computed from the *current* cells
 * @returns {Map<string, {aspects: DecorationSet, otherAspects: DecorationSet}>}
 */
export function projectHighlightToCells(state, cellOffsets) {
  const { aspects, otherAspects } = state.field(highlightState)
  /** @type {Map<string, {aspects: DecorationSet, otherAspects: DecorationSet}>} */
  const result = new Map()
  for (const entry of cellOffsets) {
    if (entry.type !== 'code') continue
    result.set(entry.cellId, {
      aspects: projectRangeSetToWindow(aspects, entry.from, entry.to),
      otherAspects: projectRangeSetToWindow(otherAspects, entry.from, entry.to),
    })
  }
  return result
}

/**
 * A cell's own local goal-mark overlay -- dispatched into by the hidden
 * view's projection driver (see the route) whenever `agdaGoalState` changes
 * there. Mapped through this cell's own local edits (`tr.changes`) so the
 * overlay stays visually consistent for the brief window between a local
 * edit and the next authoritative projection arriving back down from the
 * hidden view -- the same pattern goal-state.js/highlight.js use for their
 * own StateFields.
 * @type {import('@codemirror/state').StateEffectType<DecorationSet>}
 */
export const setCellGoalDecorations = StateEffect.define()

const cellGoalOverlayField = StateField.define({
  /** @returns {DecorationSet} */
  create() {
    return Decoration.none
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCellGoalDecorations)) value = effect.value
    }
    if (tr.docChanged) value = value.map(tr.changes)
    return value
  },
  provide: field => EditorView.decorations.from(field),
})

/**
 * @type {import('@codemirror/state').StateEffectType<{aspects: DecorationSet, otherAspects: DecorationSet}>}
 */
export const setCellHighlightDecorations = StateEffect.define()

const initialCellHighlight = { aspects: Decoration.none, otherAspects: Decoration.none }

const cellHighlightOverlayField = StateField.define({
  create() {
    return initialCellHighlight
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCellHighlightDecorations)) value = effect.value
    }
    if (tr.docChanged) {
      value = { aspects: value.aspects.map(tr.changes), otherAspects: value.otherAspects.map(tr.changes) }
    }
    return value
  },
  provide: field => [
    EditorView.decorations.from(field, value => value.aspects),
    EditorView.outerDecorations.from(field, value => value.otherAspects),
  ],
})

/** @returns {import('@codemirror/state').Extension} */
export function cellDecorationOverlays() {
  return [cellGoalOverlayField, cellHighlightOverlayField]
}
