/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import { offsetTracking } from '$lib/codemirror/offsets'
import { agdaGoalState, getAgdaGoals } from './goal-state'
import { buildGoalTransaction } from './goals'
import { replaceGoal, removeGoalBoundary, replaceGoalClause, setGoalContent, expandStandaloneQuestionMarks, indentContinuationLines } from './editor-mutations'

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

  it('converts a bare ? in the given content into a real hole and fires a reload event', () => {
    const view = makeView('foo = {! !}', { id: 0, hole: '{! !}' })
    const ok = replaceGoal(view, 0, 's ?', undefined)
    expect(ok).toBe(true)
    expect(view.state.doc.toString()).toBe('foo = s {!   !}')
    expect(view.dispatchedEvents).toHaveLength(1)
    expect(/** @type {CustomEvent} */ (view.dispatchedEvents[0]).type).toBe('agda-reload-needed')
    expect(/** @type {CustomEvent} */ (view.dispatchedEvents[0]).detail).toEqual({ reason: 'give-with-new-goal' })
  })

  it('does not fire a reload event when the given content has no bare ?', () => {
    const view = makeView('foo = {! !}', { id: 0, hole: '{! !}' })
    replaceGoal(view, 0, 'zero', undefined)
    expect(view.dispatchedEvents).toHaveLength(0)
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

  it('converts a bare ? left in the goal content into a real hole and fires a reload event', () => {
    const view = makeView('foo = {! s ? !}', { id: 0, hole: '{! s ? !}' })
    const ok = removeGoalBoundary(view, 0, false, undefined)
    expect(ok).toBe(true)
    expect(view.state.doc.toString()).toBe('foo = s {!   !}')
    expect(view.dispatchedEvents).toHaveLength(1)
    expect(/** @type {CustomEvent} */ (view.dispatchedEvents[0]).type).toBe('agda-reload-needed')
  })
})

describe('setGoalContent', () => {
  it("rewrites a goal's content and keeps tracking the goal", () => {
    const view = makeView('p = refl {x = {! !}}', { id: 0, hole: '{! !}' })
    expect(setGoalContent(view, 0, 'z')).toBe(true)
    expect(view.state.doc.toString()).toBe('p = refl {x = {! z !}}')
    expect(getAgdaGoals(view.state).map(goal => [goal.id, goal.text])).toEqual([[0, '{! z !}']])
  })

  it('returns false, changing nothing, when the goal is not in the editor', () => {
    const view = makeView('p = refl')
    expect(setGoalContent(view, 0, 'z')).toBe(false)
    expect(view.state.doc.toString()).toBe('p = refl')
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

  it('replaces only the current clause inside `λ { }` braces, joined with "; " on new lines', () => {
    const doc = 'bar = λ { x → {! !} }'
    const view = makeView(doc)
    const goalFrom = doc.indexOf('{! !}')
    const goal = { from: goalFrom, to: goalFrom + '{! !}'.length }

    replaceGoalClause(view, goal, ['zero → ?', 'suc n → ?'], 'ExtendedLambda')

    expect(view.state.doc.toString()).toBe('bar = λ { zero → {!   !}\n       ; suc n → {!   !} }')
  })

  it('replaces only the current clause inside `λ where`, joined by newline + matching indentation', () => {
    const doc = 'bar = λ where\n  x → {! !}'
    const view = makeView(doc)
    const goalFrom = doc.indexOf('{! !}')
    const goal = { from: goalFrom, to: goalFrom + '{! !}'.length }

    replaceGoalClause(view, goal, ['zero → ?', 'suc n → ?'], 'ExtendedLambda')

    expect(view.state.doc.toString()).toBe('bar = λ where\n  zero → {!   !}\n  suc n → {!   !}')
  })

  it('leaves an unrelated top-level line untouched for the ExtendedLambda variant', () => {
    const doc = 'foo : N -> N\nfoo n = λ { x → {! !} }'
    const view = makeView(doc)
    const goalFrom = doc.indexOf('{! !}')
    const goal = { from: goalFrom, to: goalFrom + '{! !}'.length }

    replaceGoalClause(view, goal, ['zero → ?'], 'ExtendedLambda')

    expect(view.state.doc.toString()).toBe('foo : N -> N\nfoo n = λ { zero → {!   !} }')
  })
})

describe('expandStandaloneQuestionMarks', () => {
  it('expands a `?` that stands alone as a token', () => {
    expect(expandStandaloneQuestionMarks('suc ?')).toBe('suc {!   !}')
    expect(expandStandaloneQuestionMarks('?')).toBe('{!   !}')
    expect(expandStandaloneQuestionMarks('f (?) {?}')).toBe('f ({!   !}) {{!   !}}')
  })

  it('leaves a `?` that is part of a name', () => {
    expect(expandStandaloneQuestionMarks('is? b')).toBe('is? b')
    expect(expandStandaloneQuestionMarks('m ≤? n')).toBe('m ≤? n')
    expect(expandStandaloneQuestionMarks('_?_ ?a a?b')).toBe('_?_ ?a a?b')
  })
})

describe('question marks inside names', () => {
  it('Give keeps `is?` and fires no reload when there is no new hole', () => {
    const view = makeView('f b = {! is? b !}', { id: 0, hole: '{! is? b !}' })
    replaceGoal(view, 0, 'is? b', undefined)
    expect(view.state.doc.toString()).toBe('f b = is? b')
    expect(view.dispatchedEvents).toHaveLength(0)
  })

  it('Case split keeps `not?` in the clauses', () => {
    const view = makeView('not? b = {! b !}')
    replaceGoalClause(view, { from: 9, to: 16 }, ['not? true = ?', 'not? false = ?'])
    expect(view.state.doc.toString()).toBe('not? true = {!   !}\nnot? false = {!   !}')
  })
})

describe('multi-line Give results', () => {
  it('indents continuation lines to the goal column', () => {
    expect(indentContinuationLines('a\nb\n  c', '    ')).toBe('a\n    b\n      c')
  })

  it('Give keeps a wrapped result inside the clause', () => {
    const view = makeView('  r = {! !}', { id: 0, hole: '{! !}' })
    replaceGoal(view, 0, 'f (g x)\n(h y)', undefined)
    expect(view.state.doc.toString()).toBe('  r = f (g x)\n      (h y)')
  })
})

describe('Case split replaces the rest of the clause line', () => {
  it('drops the other goals Agda reprints in the new clauses', () => {
    const doc = 'f x y = {! x !} , {!   !}'
    const view = makeView(doc)
    replaceGoalClause(view, { from: 8, to: 15 }, ['f z y = ? , ?', 'f (s x) y = ? , ?'])
    expect(view.state.doc.toString()).toBe('f z y = {!   !} , {!   !}\nf (s x) y = {!   !} , {!   !}')
  })

  it('keeps a trailing comment and the following lines', () => {
    const doc = 'f x = {! x !} + z -- note\ng = z'
    const view = makeView(doc)
    replaceGoalClause(view, { from: 6, to: 13 }, ['f z = ?', 'f (s x) = ?'])
    expect(view.state.doc.toString()).toBe('f z = {!   !}\nf (s x) = {!   !} -- note\ng = z')
  })
})
