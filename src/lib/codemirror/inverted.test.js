/// <reference types="vitest/globals" />

import { EditorState, StateField, StateEffect } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
import { makeDecoInvertedEffects } from './inverted'

/** captures the ranges the inverted-effects callback reconstructed */
const captured = StateEffect.define()

/**
 * @param {import('@codemirror/state').Range<Decoration>[]} decos
 * @param {{point?: boolean}} [opts]
 */
function makeField(decos, opts = {}) {
  const field = StateField.define({
    create: () => Decoration.set(decos, true),
    update: (value, tr) => value.map(tr.changes),
  })
  const extensions = [
    field,
    makeDecoInvertedEffects(field, value => value, arr => [captured.of(arr)]),
  ]
  return { field, extensions, opts }
}

/**
 * @param {EditorState} state
 * @param {import('@codemirror/state').TransactionSpec} spec
 */
function invertedCallback(state) {
  return state.facet(invertedEffects)[0]
}

describe('makeDecoInvertedEffects', () => {
  it('reconstructs the portion of a decoration that overlaps a deletion, clipped to the deleted range', () => {
    const { extensions } = makeField([Decoration.mark({ class: 'x' }).range(2, 5)])
    const state = EditorState.create({ doc: 'abcdefghij', extensions })
    const tr = state.update({ changes: { from: 3, to: 4, insert: '' } })

    const effects = invertedCallback(state)(tr)
    expect(effects).toHaveLength(1)
    const arr = /** @type {any} */ (effects[0]).value
    expect(arr).toHaveLength(1)
    expect(arr[0]).toMatchObject({ from: 3, to: 4 })
  })

  it('returns no effects when the change does not touch any decoration', () => {
    const { extensions } = makeField([Decoration.mark({ class: 'x' }).range(2, 5)])
    const state = EditorState.create({ doc: 'abcdefghij', extensions })
    const tr = state.update({ changes: { from: 7, to: 8, insert: '' } })

    expect(invertedCallback(state)(tr)).toEqual([])
  })

  it('reconstructs a zero-width point decoration touched by a deletion', () => {
    const { extensions } = makeField([Decoration.widget({ widget: dummyWidget() }).range(4, 4)])
    const state = EditorState.create({ doc: 'abcdefghij', extensions })
    const tr = state.update({ changes: { from: 3, to: 5, insert: '' } })

    const effects = invertedCallback(state)(tr)
    expect(effects).toHaveLength(1)
    const arr = /** @type {any} */ (effects[0]).value
    expect(arr).toEqual([expect.objectContaining({ from: 4, to: 4 })])
  })

  it('reports multiple affected decorations sorted by position', () => {
    const { extensions } = makeField([
      Decoration.mark({ class: 'b' }).range(8, 9),
      Decoration.mark({ class: 'a' }).range(2, 3),
    ])
    const state = EditorState.create({ doc: 'abcdefghij', extensions })
    const tr = state.update({
      changes: [{ from: 2, to: 3, insert: '' }, { from: 8, to: 9, insert: '' }],
    })

    const effects = invertedCallback(state)(tr)
    const arr = /** @type {any} */ (effects[0]).value
    expect(arr.map((/** @type {any} */ r) => r.value.spec.class)).toEqual(['a', 'b'])
  })
})

function dummyWidget() {
  class DummyWidget {
    toDOM() {
      return document.createElement('span')
    }
    eq() {
      return true
    }
  }
  return new DummyWidget()
}
