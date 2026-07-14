/// <reference types="vitest/globals" />

import { EditorState, RangeSet } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { offsetTracking } from '$lib/codemirror/offsets'
import { agdaGoalState, getAgdaGoals } from './goal-state'
import {
  buildGoalTransaction,
  buildLegacyGoalTransaction,
  expandGoals,
  getGoalRangeById,
  getGoalAtPosition,
} from './goals'

/** @param {string} doc */
function makeState(doc) {
  return EditorState.create({ doc, extensions: [offsetTracking(), agdaGoalState] })
}

// 1-based code-point positions, matching Agda's own Position.pos convention
// (see offsets.js: despite the "utf8" naming, positions here are code points).
/**
 * @param {number} line
 * @param {number} startCol
 * @param {number} endCol
 */
function ipRange(line, startCol, endCol) {
  return [{ start: { pos: startCol, line, col: startCol }, end: { pos: endCol, line, col: endCol } }]
}

describe('buildGoalTransaction', () => {
  it('expands a bare "?" hole into {!  !} and registers a tracked goal', () => {
    const state = makeState('foo = ?')
    // '?' occupies 0-indexed [6, 7) -> 1-based pos 7..8
    const ip = { id: 0, range: ipRange(1, 7, 8) }
    const spec = buildGoalTransaction(state, [ip])
    const newState = state.update(spec).state

    expect(newState.doc.toString()).toBe('foo = {!  !}')

    const goals = getAgdaGoals(newState)
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({
      id: 0,
      outerFrom: 6,
      outerTo: 12,
      text: '{!  !}',
      range: '1:7-8',
    })
  })

  it('leaves an already-expanded hole in place without inserting text', () => {
    const state = makeState('foo = {! !}')
    const ip = { id: 1, range: ipRange(1, 7, 12) }
    const spec = buildGoalTransaction(state, [ip])
    const newState = state.update(spec).state

    expect(newState.doc.toString()).toBe('foo = {! !}')
    expect(getAgdaGoals(newState)).toHaveLength(1)
  })

  it('returns an empty transaction spec when every interaction point maps to an empty range', () => {
    const state = makeState('foo = ?')
    const ip = { id: 0, range: ipRange(1, 7, 7) }
    expect(buildGoalTransaction(state, [ip])).toEqual({})
  })
})

describe('buildLegacyGoalTransaction', () => {
  it('pairs holes (in document order) with the given ids', () => {
    const state = makeState('a {! !} b {! !}')
    const holes = RangeSet.of([
      Decoration.mark({ class: 'agda-hole' }).range(2, 7),
      Decoration.mark({ class: 'agda-hole' }).range(10, 15),
    ])
    const spec = buildLegacyGoalTransaction(state, holes, [10, 20])
    const newState = state.update(spec).state
    const goals = getAgdaGoals(newState).sort((a, b) => a.outerFrom - b.outerFrom)
    expect(goals.map(g => g.id)).toEqual([10, 20])
  })

  it('throws when the number of ids does not match the number of holes', () => {
    const state = makeState('a {! !}')
    const holes = RangeSet.of([Decoration.mark({ class: 'agda-hole' }).range(2, 7)])
    expect(() => buildLegacyGoalTransaction(state, holes, [1, 2])).toThrow(/mismatched/)
  })
})

describe('expandGoals', () => {
  it('builds an insertion changeset only for ranges that are exactly "?"', () => {
    const state = makeState('a ? b')
    const changes = expandGoals(state, [{ from: 2, to: 3 }])
    expect(changes.apply(state.doc).toString()).toBe('a {!  !} b')
  })

  it('skips ranges whose content is not "?"', () => {
    const state = makeState('a b c')
    const changes = expandGoals(state, [{ from: 2, to: 3 }])
    expect(changes.apply(state.doc).toString()).toBe('a b c')
  })
})

describe('getGoalRangeById / getGoalAtPosition', () => {
  it('finds a tracked goal by id and by position', () => {
    const state = makeState('foo = ?')
    const ip = { id: 0, range: ipRange(1, 7, 8) }
    const newState = state.update(buildGoalTransaction(state, [ip])).state

    expect(getGoalRangeById(newState, 0)).toEqual({ from: 6, to: 12 })
    expect(getGoalAtPosition(newState, 8)).toMatchObject({ id: 0, from: 6, to: 12 })
  })

  it('returns null when no goal matches', () => {
    const state = makeState('foo = ?')
    expect(getGoalRangeById(state, 99)).toBeNull()
    expect(getGoalAtPosition(state, 0)).toBeNull()
  })
})
