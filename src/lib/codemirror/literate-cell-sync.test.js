/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { agdaGoalState } from '$lib/agda/goal-state'
import { highlightState } from '$lib/agda/highlight'
import { addGoals, setHighlight } from '$lib/agda/effects'
import { createMarkdownCell, createCodeCell, computeCellContentOffsets, assembleDocument } from '$lib/agda/literate-cells'
import {
  translateCellChangesToGlobal,
  translateGlobalChangesToCells,
  cellPositionToGlobal,
  globalPositionToCell,
  projectRangeSetToWindow,
  projectGoalsToCells,
  projectHighlightToCells,
} from './literate-cell-sync'

/** @param {string} doc @param {{from: number, to: number, insert: string}} change */
function changesFor(doc, change) {
  const state = EditorState.create({ doc })
  const tr = state.update({ changes: change })
  return tr.changes
}

describe('translateCellChangesToGlobal', () => {
  it('offsets a local change into global coordinates', () => {
    const changes = changesFor('foo : Set', { from: 4, to: 7, insert: 'Bar' })
    const specs = translateCellChangesToGlobal(100, changes)
    expect(specs).toEqual([{ from: 104, to: 107, insert: 'Bar' }])
  })

  it('handles a pure insertion', () => {
    const changes = changesFor('foo', { from: 3, to: 3, insert: '!' })
    const specs = translateCellChangesToGlobal(10, changes)
    expect(specs).toEqual([{ from: 13, to: 13, insert: '!' }])
  })
})

describe('translateGlobalChangesToCells', () => {
  const md = createMarkdownCell('intro')
  const code = createCodeCell('foo : Set')
  const cells = [md, code]
  const offsets = computeCellContentOffsets(cells)
  const doc = assembleDocument(cells)

  it('resolves a change inside one cell to that cell, with local offsets', () => {
    const codeOffset = offsets[1]
    const changes = changesFor(doc, { from: codeOffset.from + 4, to: codeOffset.from + 7, insert: 'Bar' })
    const byCell = translateGlobalChangesToCells(offsets, changes)

    expect(byCell.size).toBe(1)
    expect(byCell.get(code.id)).toEqual([{ from: 4, to: 7, insert: 'Bar' }])
  })

  it('drops a change that does not cleanly fall within one cell (touches a fence/separator)', () => {
    // Straddles the boundary between the markdown cell's content and the
    // code cell's opening fence -- should never happen for a real Agda
    // mutation (always scoped to one goal), but must not corrupt a cell.
    const changes = changesFor(doc, { from: offsets[0].to, to: offsets[1].from + 1, insert: 'x' })
    const byCell = translateGlobalChangesToCells(offsets, changes)
    expect(byCell.size).toBe(0)
  })
})

describe('cellPositionToGlobal / globalPositionToCell', () => {
  const md = createMarkdownCell('intro')
  const code = createCodeCell('foo : Set')
  const cells = [md, code]
  const offsets = computeCellContentOffsets(cells)
  const codeOffset = offsets[1]

  it('translates a local position inside the cell to the matching global position', () => {
    expect(cellPositionToGlobal(codeOffset, 4)).toBe(codeOffset.from + 4)
  })

  it('accepts the boundary positions (start and end of the cell content)', () => {
    expect(cellPositionToGlobal(codeOffset, 0)).toBe(codeOffset.from)
    expect(cellPositionToGlobal(codeOffset, code.text.length)).toBe(codeOffset.to)
  })

  it('returns null for a local position past the end of the cell content', () => {
    expect(cellPositionToGlobal(codeOffset, code.text.length + 1)).toBeNull()
  })

  it('round-trips through globalPositionToCell back to the same cell and local position', () => {
    const globalPos = cellPositionToGlobal(codeOffset, 4)
    expect(globalPositionToCell(offsets, /** @type {number} */ (globalPos))).toEqual({
      cellId: code.id,
      localPos: 4,
    })
  })

  it('returns null for a global position inside a synthesized fence, not any cell\'s content', () => {
    // codeOffset.from - 1 lands inside the code fence opener ("```agda\n"),
    // before the cell's own content starts.
    expect(globalPositionToCell(offsets, codeOffset.from - 1)).toBeNull()
  })
})

describe('projectRangeSetToWindow', () => {
  it('clips and re-anchors decorations to a window', () => {
    const rangeSet = Decoration.set([
      Decoration.mark({ class: 'a' }).range(2, 5),
      Decoration.mark({ class: 'b' }).range(10, 15),
      Decoration.mark({ class: 'c' }).range(20, 25),
    ])
    const projected = projectRangeSetToWindow(rangeSet, 8, 18)

    /** @type {{from: number, to: number, class: string}[]} */
    const results = []
    projected.between(0, 100, (from, to, value) => results.push({ from, to, class: value.spec.class }))

    expect(results).toEqual([{ from: 2, to: 7, class: 'b' }])
  })

  it('clips a decoration that only partially overlaps the window', () => {
    const rangeSet = Decoration.set([Decoration.mark({ class: 'a' }).range(5, 15)])
    const projected = projectRangeSetToWindow(rangeSet, 10, 20)

    /** @type {{from: number, to: number}[]} */
    const results = []
    projected.between(0, 100, (from, to) => results.push({ from, to }))

    expect(results).toEqual([{ from: 0, to: 5 }])
  })

  it('returns an empty set when nothing overlaps', () => {
    const rangeSet = Decoration.set([Decoration.mark({ class: 'a' }).range(2, 5)])
    const projected = projectRangeSetToWindow(rangeSet, 100, 200)
    let count = 0
    projected.between(0, 1000, () => { count++ })
    expect(count).toBe(0)
  })
})

describe('projectGoalsToCells', () => {
  it('translates a goal on the hidden view into the correct cell\'s local offsets', () => {
    const md = createMarkdownCell('intro')
    const code = createCodeCell('idN n = {! !}')
    const cells = [md, code]
    const offsets = computeCellContentOffsets(cells)
    const doc = assembleDocument(cells)

    const goalLocalFrom = code.text.indexOf('{!')
    const goalGlobalFrom = offsets[1].from + goalLocalFrom
    const goalGlobalTo = goalGlobalFrom + '{! !}'.length

    let state = EditorState.create({ doc, extensions: [agdaGoalState] })
    state = state.update({
      effects: addGoals.of([Decoration.mark({ id: 42 }).range(goalGlobalFrom, goalGlobalTo)]),
    }).state

    const projected = projectGoalsToCells(state, offsets)
    expect(projected.has(md.id)).toBe(false)

    /** @type {{from: number, to: number}[]} */
    const results = []
    projected.get(code.id)?.between(0, code.text.length, (from, to) => results.push({ from, to }))
    expect(results).toEqual([{ from: goalLocalFrom, to: goalLocalFrom + '{! !}'.length }])
  })

  it('produces an empty decoration set for a cell with no goals', () => {
    const code = createCodeCell('open import Foo\n')
    const cells = [code]
    const offsets = computeCellContentOffsets(cells)
    const doc = assembleDocument(cells)

    const state = EditorState.create({ doc, extensions: [agdaGoalState] })
    const projected = projectGoalsToCells(state, offsets)

    let count = 0
    projected.get(code.id)?.between(0, code.text.length, () => { count++ })
    expect(count).toBe(0)
  })
})

describe('projectHighlightToCells', () => {
  it('translates highlighting decorations into the correct cell\'s local offsets', () => {
    const code = createCodeCell('foo : Set')
    const cells = [code]
    const offsets = computeCellContentOffsets(cells)
    const doc = assembleDocument(cells)
    const globalFrom = offsets[0].from
    const globalTo = globalFrom + 3 // "foo"

    let state = EditorState.create({ doc, extensions: [highlightState] })
    state = state.update({
      effects: setHighlight.of({
        isToken: true,
        decos: [Decoration.mark({ class: 'cm-agda-bound' }).range(globalFrom, globalTo)],
      }),
    }).state

    const projected = projectHighlightToCells(state, offsets)

    /** @type {{from: number, to: number}[]} */
    const results = []
    projected.get(code.id)?.aspects.between(0, code.text.length, (from, to) => results.push({ from, to }))
    expect(results).toEqual([{ from: 0, to: 3 }])
  })
})
