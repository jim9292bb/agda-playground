/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import { pinnedPositions, pinPosition, unpinPosition } from './pinned-positions'

describe('pinnedPositions', () => {
  it('moves a pinned position with edits before it and forgets it when unpinned', () => {
    const key = Symbol('cmd')
    let state = EditorState.create({ doc: 'abc {! x !}', extensions: [pinnedPositions] })
    state = state.update({ effects: pinPosition.of({ key, pos: 6 }) }).state
    state = state.update({ changes: { from: 0, insert: '-- note\n' } }).state
    expect(state.field(pinnedPositions).get(key)).toBe(14)
    state = state.update({ selection: { anchor: 0 } }).state
    expect(state.field(pinnedPositions).get(key)).toBe(14)
    state = state.update({ effects: unpinPosition.of(key) }).state
    expect(state.field(pinnedPositions).has(key)).toBe(false)
  })
})
