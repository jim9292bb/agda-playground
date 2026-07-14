/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import {
  commit,
  countSurrogates,
  offsetTracking,
  utf8PosToUtf16,
  utf16PosToUtf8,
  mapUtf8Pos,
  mapUtf8Range,
} from './offsets'

/** @param {string} doc */
function makeState(doc) {
  return EditorState.create({ doc, extensions: [offsetTracking()] })
}

describe('countSurrogates', () => {
  it('counts zero for ascii-only text', () => {
    expect(countSurrogates('abc')).toBe(0)
  })

  it('counts zero for BMP multi-byte (non-surrogate) text', () => {
    expect(countSurrogates('café')).toBe(0)
  })

  it('counts one per astral surrogate pair', () => {
    expect(countSurrogates('😀😀')).toBe(2)
  })

  it('counts surrogate pairs mixed with ascii', () => {
    expect(countSurrogates('a😀b😀c')).toBe(2)
  })
})

describe('utf8PosToUtf16 / utf16PosToUtf8', () => {
  // These "utf8" positions are actually code-point counts: a single-unit BMP
  // character (like 'é', 1 utf16 unit) counts as 1 regardless of its real
  // UTF-8 byte width, while an astral character ('😀', a 2-unit surrogate
  // pair in utf16) also collapses to 1 — that's the only case where it
  // diverges from the utf16 length.
  const doc = 'aé😀b\ncd'
  const state = makeState(doc)

  it('round-trips utf16 -> utf8 -> utf16 at every code-point boundary', () => {
    let utf16 = 0
    for (const ch of doc) {
      const utf8 = utf16PosToUtf8(state, utf16)
      expect(utf8PosToUtf16(state, utf8)).toBe(utf16)
      utf16 += ch.length
    }
  })

  it('maps positions 1:1 for ascii-only documents', () => {
    const asciiState = makeState('hello\nworld')
    expect(utf16PosToUtf8(asciiState, 5)).toBe(5)
    expect(utf8PosToUtf16(asciiState, 5)).toBe(5)
  })

  it('counts a BMP multi-byte character as a single unit', () => {
    // after 'a' + 'é' -> utf16 offset 2, utf8 (code-point) offset 2
    expect(utf16PosToUtf8(state, 2)).toBe(2)
    expect(utf8PosToUtf16(state, 2)).toBe(2)
  })

  it('collapses an astral surrogate pair to a single unit', () => {
    // after 'a' + 'é' + '😀' -> utf16 offset 4 (😀 is 2 utf16 units), utf8 offset 3
    expect(utf16PosToUtf8(state, 4)).toBe(3)
    expect(utf8PosToUtf16(state, 3)).toBe(4)
  })

  it('resolves positions on the second line using its own utf8 line offset', () => {
    // line 1 ('aé😀b') is 4 code points; line 2 starts after that + 1 newline
    expect(utf16PosToUtf8(state, doc.indexOf('cd') + 1)).toBe(4 + 1 + 1)
  })
})

describe('mapUtf8Pos / mapUtf8Range', () => {
  it('shifts a utf8 position forward by an uncommitted insertion before it', () => {
    const state = makeState('abcdef')
    const tr = state.update({ changes: { from: 0, to: 0, insert: 'XY' } })
    expect(mapUtf8Pos(tr.state, 4)).toBe(6)
  })

  it('leaves a utf8 position before an uncommitted insertion unchanged', () => {
    const state = makeState('abcdef')
    const tr = state.update({ changes: { from: 4, to: 4, insert: 'XY' } })
    expect(mapUtf8Pos(tr.state, 2)).toBe(2)
  })

  it('shifts both ends of a utf8 range', () => {
    const state = makeState('abcdef')
    const tr = state.update({ changes: { from: 0, to: 0, insert: 'XY' } })
    expect(mapUtf8Range(tr.state, 1, 3)).toEqual([3, 5])
  })

  it('commit checkpoints the doc so later positions no longer need remapping', () => {
    const state = makeState('abcdef')
    const afterInsert = state.update({ changes: { from: 0, to: 0, insert: 'XY' } }).state
    const afterCommit = afterInsert.update({ effects: commit.of() }).state
    expect(utf8PosToUtf16(afterCommit, 0)).toBe(0)
    expect(mapUtf8Pos(afterCommit, 4)).toBe(4)
  })
})
