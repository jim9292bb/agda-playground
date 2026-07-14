/// <reference types="vitest/globals" />

import { EditorState, EditorSelection } from '@codemirror/state'
import { offsetTracking } from '$lib/codemirror/offsets'
import { agdaGoalState } from './goal-state'
import { buildGoalTransaction } from './goals'
import { noAgdaRange } from './ranges'
import { getAgdaShortcutContext } from './shortcut-context'

/** @param {string} doc */
function baseState(doc) {
  return EditorState.create({ doc, extensions: [offsetTracking(), agdaGoalState] })
}

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 */
function withCursorAt(state, pos) {
  return state.update({ selection: EditorSelection.cursor(pos) }).state
}

// A fake view exposing only `.state` -- getAgdaShortcutContext never touches
// any DOM-specific EditorView method, only `view.state`.
/** @param {import('@codemirror/state').EditorState} state */
function fakeView(state) {
  return /** @type {import('@codemirror/view').EditorView} */ (/** @type {unknown} */ ({ state }))
}

describe('getAgdaShortcutContext', () => {
  it('finds a tracked goal at the cursor and formats its content range', () => {
    let state = baseState('foo = ?')
    const ip = { id: 0, range: [{ start: { pos: 7, line: 1, col: 7 }, end: { pos: 8, line: 1, col: 8 } }] }
    state = state.update(buildGoalTransaction(state, [ip])).state
    // doc is now 'foo = {!  !}'; put the cursor inside the hole
    state = withCursorAt(state, 9)

    const ctx = getAgdaShortcutContext(fakeView(state), '/source.agda', [], '2.8.0')
    expect(ctx.goal).toMatchObject({ id: 0 })
    expect(ctx.input).toBe('')
    expect(ctx.range).toContain('intervalsToRange')
  })

  it('prefers the current selection as input even when a goal is found', () => {
    let state = baseState('foo = ?')
    const ip = { id: 0, range: [{ start: { pos: 7, line: 1, col: 7 }, end: { pos: 8, line: 1, col: 8 } }] }
    state = state.update(buildGoalTransaction(state, [ip])).state
    state = state.update({ selection: EditorSelection.range(9, 9) }).state

    const ctx = getAgdaShortcutContext(fakeView(state), '/source.agda', [], '2.8.0')
    expect(ctx.goal).toMatchObject({ id: 0 })
    expect(ctx.input).toBe('')
  })

  it('falls back to a textual hole via goalInfos when no goal is tracked', () => {
    const state = withCursorAt(baseState('foo = {! bar !}'), 10)
    const ctx = getAgdaShortcutContext(fakeView(state), '/source.agda', [{ id: 42 }], '2.8.0')
    expect(ctx.goal).toMatchObject({ id: 42 })
    expect(ctx.input).toBe('bar')
  })

  it('returns a null goal and noAgdaRange when nothing matches', () => {
    const state = withCursorAt(baseState('foo = bar'), 4)
    const ctx = getAgdaShortcutContext(fakeView(state), '/source.agda', [], '2.8.0')
    expect(ctx.goal).toBeNull()
    expect(ctx.input).toBe('')
    expect(ctx.range).toBe(noAgdaRange)
  })

  it('uses the selected text as input when the cursor is not inside any goal', () => {
    const state = baseState('foo = bar').update({ selection: EditorSelection.range(0, 3) }).state
    const ctx = getAgdaShortcutContext(fakeView(state), '/source.agda', [], '2.8.0')
    expect(ctx.goal).toBeNull()
    expect(ctx.input).toBe('foo')
  })
})
