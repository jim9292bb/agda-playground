/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import { offsetTracking } from '$lib/codemirror/offsets'
import { agdaGoalState, getAgdaGoals } from './goal-state'
import { buildGoalTransaction } from './goals'
import { replaceGoal, removeGoalBoundary, replaceGoalClause } from './editor-mutations'

// A fake EditorView: `dispatch` reduces into `.state` just like the real
// thing, and `.dom` is a plain dispatchEvent-capturing stub -- none of
// editor-mutations.js's functions touch any other DOM-specific EditorView
// API, so a real (DOM-backed) EditorView is unnecessary.
class FakeEditorView {
  /** @param {import('@codemirror/state').EditorState} state */
  constructor(state) {
    this.state = state
    /** @type {Event[]} */
    this.dispatchedEvents = []
    this.dom = { dispatchEvent: (/** @type {Event} */ e) => this.dispatchedEvents.push(e) }
  }
  /** @param {import('@codemirror/state').TransactionSpec} spec */
  dispatch(spec) {
    this.state = this.state.update(spec).state
  }
}

/**
 * @param {string} doc
 * @param {{id: number, hole: string}} [goalSpec]
 */
function makeView(doc, goalSpec) {
  let state = EditorState.create({ doc, extensions: [offsetTracking(), agdaGoalState] })
  if (goalSpec) {
    const from = doc.indexOf(goalSpec.hole)
    const to = from + goalSpec.hole.length
    const ip = {
      id: goalSpec.id,
      range: [{ start: { pos: from + 1, line: 1, col: from + 1 }, end: { pos: to + 1, line: 1, col: to + 1 } }],
    }
    state = state.update(buildGoalTransaction(state, [ip])).state
  }
  return new FakeEditorView(state)
}

describe('replaceGoal', () => {
  it('replaces a tracked goal with the given content and removes it from goal state', () => {
    const view = makeView('foo = {! !}', { id: 0, hole: '{! !}' })
    const ok = replaceGoal(view, 0, 'zero', undefined)
    expect(ok).toBe(true)
    expect(view.state.doc.toString()).toBe('foo = zero')
    expect(getAgdaGoals(view.state)).toEqual([])
  })

  it('returns false when the interaction point has no tracked or fallback goal', () => {
    const view = makeView('foo = bar')
    expect(replaceGoal(view, 0, 'zero', undefined)).toBe(false)
    expect(view.state.doc.toString()).toBe('foo = bar')
  })

  it('falls back to the given goal range when the tracked goal is gone', () => {
    const view = makeView('foo = {! !}')
    const fallback = { id: 5, from: 6, to: 11, text: '{! !}' }
    const ok = replaceGoal(view, 5, 'zero', fallback)
    expect(ok).toBe(true)
    expect(view.state.doc.toString()).toBe('foo = zero')
  })

  it('ignores a fallback goal whose id does not match the interaction point', () => {
    const view = makeView('foo = {! !}')
    const fallback = { id: 999, from: 6, to: 11, text: '{! !}' }
    expect(replaceGoal(view, 5, 'zero', fallback)).toBe(false)
  })
})

describe('removeGoalBoundary', () => {
  it('strips the {! !} boundary, keeping the trimmed content', () => {
    const view = makeView('foo = {! bar !}', { id: 0, hole: '{! bar !}' })
    const ok = removeGoalBoundary(view, 0, false, undefined)
    expect(ok).toBe(true)
    expect(view.state.doc.toString()).toBe('foo = bar')
  })

  it('parenthesizes the content when paren is true', () => {
    const view = makeView('foo = {! bar !}', { id: 0, hole: '{! bar !}' })
    const ok = removeGoalBoundary(view, 0, true, undefined)
    expect(ok).toBe(true)
    expect(view.state.doc.toString()).toBe('foo = (bar)')
  })

  it('returns false when the resolved range is not a well-formed goal hole', () => {
    const view = makeView('foo = bar')
    const fallback = { id: 5, from: 6, to: 9, text: 'bar' }
    expect(removeGoalBoundary(view, 5, false, fallback)).toBe(false)
    expect(view.state.doc.toString()).toBe('foo = bar')
  })
})

describe('replaceGoalClause', () => {
  it('replaces the goal line with indented case-split clauses and fires a reload event', () => {
    const view = makeView('  foo x = {! !}')
    const goal = { from: 10, to: 15 }
    replaceGoalClause(view, goal, ['zero -> ?', 'suc n -> ?'])

    expect(view.state.doc.toString()).toBe('  zero -> {!   !}\n  suc n -> {!   !}')
    expect(view.dispatchedEvents).toHaveLength(1)
    expect(/** @type {CustomEvent} */ (view.dispatchedEvents[0]).type).toBe('agda-reload-needed')
    expect(/** @type {CustomEvent} */ (view.dispatchedEvents[0]).detail).toEqual({ reason: 'case-split' })
  })
})
