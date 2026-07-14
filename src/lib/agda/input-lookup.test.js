/// <reference types="vitest/globals" />

import { lookupChar, formatCodePoint } from './input-lookup'

describe('lookupChar', () => {
  it('finds all input sequences that produce a common Agda symbol', () => {
    expect(lookupChar('→')).toEqual(expect.arrayContaining(['to', 'rightarrow', 'r']))
  })

  it('finds sequences for other common symbols', () => {
    expect(lookupChar('∀')).toEqual(expect.arrayContaining(['forall', 'all']))
    expect(lookupChar('≡')).toEqual(expect.arrayContaining(['equiv', 'eq']))
  })

  it('returns sequences without a leading backslash', () => {
    for (const seq of lookupChar('→')) {
      expect(seq.startsWith('\\')).toBe(false)
    }
  })

  it('returns an empty array for a character with no input sequence', () => {
    expect(lookupChar('Z')).toEqual([])
  })
})

describe('formatCodePoint', () => {
  it('formats a code point as U+XXXX, uppercase, zero-padded to 4 digits', () => {
    expect(formatCodePoint('→'.codePointAt(0))).toBe('U+2192')
  })

  it('pads code points below 0x1000 to 4 hex digits', () => {
    expect(formatCodePoint(0xA)).toBe('U+000A')
  })

  it('does not truncate code points above 4 hex digits', () => {
    expect(formatCodePoint(0x1F600)).toBe('U+1F600')
  })
})
