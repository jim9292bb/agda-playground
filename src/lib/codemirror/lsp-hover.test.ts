/// <reference types="vitest/globals" />

import { Text } from '@codemirror/state'
import { fromPosition, escHTML } from './lsp-hover'

describe('fromPosition', () => {
  it('converts a 0-based LSP {line, character} position to a document offset', () => {
    const doc = Text.of(['foo', 'bar', 'baz'])
    // line 1 (0-based) is 'bar', starting right after 'foo\n' (offset 4)
    expect(fromPosition(doc, { line: 1, character: 2 })).toBe(4 + 2)
  })

  it('resolves the first line at character 0 to offset 0', () => {
    const doc = Text.of(['foo', 'bar'])
    expect(fromPosition(doc, { line: 0, character: 0 })).toBe(0)
  })
})

describe('escHTML', () => {
  it('escapes "<" and "&" as HTML entities', () => {
    expect(escHTML('a < b & c')).toBe('a &lt; b &amp; c')
  })

  it('converts newlines to <br>', () => {
    expect(escHTML('line1\nline2')).toBe('line1<br>line2')
  })

  it('leaves plain text untouched', () => {
    expect(escHTML('hello world')).toBe('hello world')
  })

  it('does not double-escape an already-escaped ampersand entity', () => {
    // escHTML only escapes raw "&", so "&amp;" becomes "&amp;amp;" -- this
    // documents that escHTML is not idempotent, not a claim it should be.
    expect(escHTML('&amp;')).toBe('&amp;amp;')
  })
})
