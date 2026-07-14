/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import { makeAgdaGoal, goalToLegacyRange, mergeGoalInfos, extractGoalInput } from './goal-state'

describe('makeAgdaGoal', () => {
  it('parses a goal with a space-padded hole into inner/outer ranges', () => {
    const state = EditorState.create({ doc: 'foo = {!   !}' })
    const goal = makeAgdaGoal(state, 0, 6, 13, 1)
    expect(goal).toEqual({
      id: 0,
      outerFrom: 6,
      outerTo: 13,
      innerFrom: 9,
      innerTo: 10,
      documentVersion: 1,
      text: '{!   !}',
      input: ' ',
    })
  })

  it('parses a goal already containing user input', () => {
    const state = EditorState.create({ doc: 'foo = {! bar !}' })
    const goal = makeAgdaGoal(state, 0, 6, 15, 1)
    expect(goal?.input).toBe('bar')
  })

  it('handles a hole with no inner spaces', () => {
    const state = EditorState.create({ doc: '{!!}' })
    const goal = makeAgdaGoal(state, 0, 0, 4, 1)
    expect(goal).toMatchObject({ innerFrom: 2, innerTo: 2, input: '' })
  })

  it('carries through optional metadata', () => {
    const state = EditorState.create({ doc: '{! !}' })
    const goal = makeAgdaGoal(state, 0, 0, 5, 1, { range: '1,1-1,6', type: 'A', context: 'ctx' })
    expect(goal).toMatchObject({ range: '1,1-1,6', type: 'A', context: 'ctx' })
  })

  it('returns null when the range does not enclose a {! !} hole', () => {
    const state = EditorState.create({ doc: 'foo = bar' })
    expect(makeAgdaGoal(state, 0, 0, 9, 1)).toBeNull()
  })

  it('returns null for a non-finite or inverted range', () => {
    const state = EditorState.create({ doc: '{! !}' })
    expect(makeAgdaGoal(state, 0, NaN, 5, 1)).toBeNull()
    expect(makeAgdaGoal(state, 0, 3, 3, 1)).toBeNull()
    expect(makeAgdaGoal(state, 0, 5, 3, 1)).toBeNull()
  })

  it('returns null when the range falls outside the document', () => {
    const state = EditorState.create({ doc: '{! !}' })
    expect(makeAgdaGoal(state, 0, -1, 5, 1)).toBeNull()
    expect(makeAgdaGoal(state, 0, 0, 6, 1)).toBeNull()
  })
})

describe('goalToLegacyRange', () => {
  it('projects a goal down to the legacy {id, from, to, text} shape', () => {
    const goal = {
      id: 3,
      outerFrom: 10,
      outerTo: 15,
      innerFrom: 12,
      innerTo: 13,
      documentVersion: 2,
      text: '{! !}',
      input: '',
    }
    expect(goalToLegacyRange(goal)).toEqual({ id: 3, from: 10, to: 15, text: '{! !}' })
  })
})

describe('mergeGoalInfos', () => {
  it('returns an empty array when incoming is empty', () => {
    expect(mergeGoalInfos([{ id: 1, type: 'A' }], [])).toEqual([])
  })

  it('adds new goal infos not present in current', () => {
    const result = mergeGoalInfos([], [{ id: 1, type: 'A' }])
    expect(result).toEqual([{ id: 1, type: 'A' }])
  })

  it('overwrites fields present on the incoming entry', () => {
    const result = mergeGoalInfos([{ id: 1, type: 'A', context: 'old' }], [{ id: 1, type: 'B' }])
    expect(result).toEqual([{ id: 1, type: 'B', context: 'old' }])
  })

  it('keeps prior type/range/context when incoming omits them', () => {
    const current = [{ id: 1, type: 'A', range: 'r1', context: 'c1' }]
    const incoming = [{ id: 1 }]
    expect(mergeGoalInfos(current, incoming)).toEqual([{ id: 1, type: 'A', range: 'r1', context: 'c1' }])
  })
})

describe('extractGoalInput', () => {
  it('strips exactly one padding space from each side of a goal hole', () => {
    expect(extractGoalInput('{! foo !}')).toBe('foo')
  })

  it('leaves extra inner spaces beyond the single padding space intact', () => {
    expect(extractGoalInput('{!  foo  !}')).toBe(' foo ')
  })

  it('returns the input unchanged for text that is not a goal hole', () => {
    expect(extractGoalInput('not a goal')).toBe('not a goal')
  })
})
