/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import { offsetTracking } from '$lib/codemirror/offsets'
import { buildHighlightEffects } from './highlight'

/** @param {string} doc */
function makeState(doc) {
  return EditorState.create({ doc, extensions: [offsetTracking()] })
}

/**
 * @param {[number, number]} range 1-based code-point [start, end)
 * @param {string[]} atoms
 * @param {Partial<{tokenBased: string, note: string, definitionSite: null}>} [extra]
 */
function spec(range, atoms, extra = {}) {
  return { range, atoms, tokenBased: 'TokenBased', note: '', definitionSite: null, ...extra }
}

/** @param {import('@codemirror/state').StateEffect<unknown>[]} effects */
function findHighlight(effects, isToken) {
  return effects
    .map(e => /** @type {any} */ (e).value)
    .find(v => v && v.isToken === isToken)
}

describe('buildHighlightEffects', () => {
  it('merges recognized aspect atoms into a single "aspects" decoration', () => {
    const state = makeState('foo bar baz')
    const effects = buildHighlightEffects(state, [spec([1, 4], ['keyword'])])
    const aspects = findHighlight(effects, true)
    expect(aspects.decos).toHaveLength(1)
    expect(aspects.decos[0]).toMatchObject({ from: 0, to: 3 })
    expect(aspects.decos[0].value.spec.class).toBe('agda-keyword')
  })

  it('puts the "operator" class first when the operator atom is present', () => {
    const state = makeState('foo bar baz')
    const effects = buildHighlightEffects(state, [spec([5, 8], ['operator', 'keyword'])])
    const aspects = findHighlight(effects, true)
    expect(aspects.decos[0].value.spec.class).toBe('agda-operator agda-keyword')
  })

  it('routes an unrecognized/"other" aspect atom to its own otherAspects decoration', () => {
    const state = makeState('foo bar baz')
    const effects = buildHighlightEffects(state, [spec([9, 12], ['unsolvedmeta'])])
    const aspects = findHighlight(effects, true)
    const other = findHighlight(effects, false)
    expect(aspects).toBeUndefined()
    expect(other.decos).toHaveLength(1)
    expect(other.decos[0]).toMatchObject({ from: 8, to: 11 })
    expect(other.decos[0].value.spec.class).toBe('agda-unsolvedmeta')
  })

  it('skips a spec entirely when it carries the "hole" atom', () => {
    const state = makeState('foo bar baz')
    const effects = buildHighlightEffects(state, [spec([1, 4], ['hole', 'keyword'])])
    expect(effects).toEqual([])
  })

  it('skips a spec whose mapped range is empty', () => {
    const state = makeState('foo bar baz')
    const effects = buildHighlightEffects(state, [spec([1, 1], ['keyword'])])
    expect(effects).toEqual([])
  })

  it('emits both an aspects and an otherAspects effect when both kinds are present', () => {
    const state = makeState('foo bar baz')
    const effects = buildHighlightEffects(state, [
      spec([1, 4], ['keyword']),
      spec([9, 12], ['unsolvedmeta']),
    ])
    expect(effects).toHaveLength(2)
    expect(findHighlight(effects, true).decos).toHaveLength(1)
    expect(findHighlight(effects, false).decos).toHaveLength(1)
  })

  it('records the original sliced text on the decoration spec', () => {
    const state = makeState('foo bar baz')
    const effects = buildHighlightEffects(state, [spec([1, 4], ['keyword'])])
    const aspects = findHighlight(effects, true)
    expect(aspects.decos[0].value.spec.originalText).toBe('foo')
  })
})
