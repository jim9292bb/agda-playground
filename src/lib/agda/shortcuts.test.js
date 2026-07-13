/// <reference types="vitest/globals" />

import {
  advanceAgdaChord,
  parseAgdaChordBinding,
  validateAgdaShortcutOverrides,
} from './shortcuts'

describe('parseAgdaChordBinding', () => {
  it('parses a 2-step chord', () => {
    const binding = parseAgdaChordBinding('C-c C-l')
    expect(binding?.label).toBe('Ctrl-c Ctrl-l')
    expect(binding?.steps).toEqual([
      { key: 'c', ctrl: true },
      { key: 'l', ctrl: true },
    ])
  })

  it('parses a 3-step chord', () => {
    const binding = parseAgdaChordBinding('C-c C-x C-a')
    expect(binding?.label).toBe('Ctrl-c Ctrl-x Ctrl-a')
    expect(binding?.steps).toHaveLength(3)
  })

  it('parses a chord that does not start with c', () => {
    const binding = parseAgdaChordBinding('C-x C-s')
    expect(binding?.label).toBe('Ctrl-x Ctrl-s')
    expect(binding?.steps).toEqual([
      { key: 'x', ctrl: true },
      { key: 's', ctrl: true },
    ])
  })

  it('normalizes Space and SPC to a space step', () => {
    expect(parseAgdaChordBinding('C-c C-Space')?.steps).toEqual([
      { key: 'c', ctrl: true },
      { key: ' ', ctrl: true, code: 'Space' },
    ])
    expect(parseAgdaChordBinding('C-c C-SPC')?.steps).toEqual([
      { key: 'c', ctrl: true },
      { key: ' ', ctrl: true, code: 'Space' },
    ])
  })

  it('is case-insensitive on the C- prefix and collapses whitespace', () => {
    expect(parseAgdaChordBinding('c-c   c-l')?.label).toBe('Ctrl-c Ctrl-l')
  })

  it('also accepts the full "Ctrl-" word form (Settings UI uses this)', () => {
    expect(parseAgdaChordBinding('Ctrl-c Ctrl-g')?.label).toBe('Ctrl-c Ctrl-g')
    expect(parseAgdaChordBinding('Ctrl-x Ctrl-s')?.label).toBe('Ctrl-x Ctrl-s')
  })

  it('rejects an empty string', () => {
    expect(parseAgdaChordBinding('')).toBeNull()
    expect(parseAgdaChordBinding('   ')).toBeNull()
  })

  it('rejects a token without a C- prefix', () => {
    expect(parseAgdaChordBinding('C-c l')).toBeNull()
  })

  it('rejects a multi-character non-space key', () => {
    expect(parseAgdaChordBinding('C-abc')).toBeNull()
  })
})

describe('validateAgdaShortcutOverrides', () => {
  it('is valid with no overrides (defaults + reserved sequences are conflict-free)', () => {
    expect(validateAgdaShortcutOverrides({})).toEqual({ valid: true, errors: [] })
  })

  it('rejects an override that parses invalidly', () => {
    const result = validateAgdaShortcutOverrides({ load: 'not a chord' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.startsWith('load:'))).toBe(true)
  })

  it('flags an exact duplicate across two shortcuts', () => {
    const result = validateAgdaShortcutOverrides({ refine: 'C-c C-l' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('load') && e.includes('refine'))).toBe(true)
  })

  it('flags a prefix conflict with the reserved abort sequence', () => {
    const result = validateAgdaShortcutOverrides({ refine: 'C-c C-x' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('__abort'))).toBe(true)
  })

  it('flags a prefix conflict with the reserved Unicode lookup sequence', () => {
    // The reserved sequence's second step ("=") never requires ctrl (matching
    // the original hardcoded dispatcher), so a bare "C-x" override is a
    // strict prefix of it and would be ambiguous.
    const result = validateAgdaShortcutOverrides({ refine: 'C-x' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('__unicode-lookup'))).toBe(true)
  })

  it('does not flag a valid, non-conflicting override', () => {
    const result = validateAgdaShortcutOverrides({ refine: 'C-c C-g' })
    expect(result).toEqual({ valid: true, errors: [] })
  })
})

describe('advanceAgdaChord', () => {
  const table = [
    { id: 'load', steps: [{ key: 'c', ctrl: true }, { key: 'l', ctrl: true }] },
    { id: 'abort', steps: [{ key: 'c', ctrl: true }, { key: 'x', ctrl: true }, { key: 'a', ctrl: true }] },
  ]

  function ctrlKeydown(key) {
    return /** @type {KeyboardEvent} */ ({ key, ctrlKey: true, altKey: false, metaKey: false })
  }

  it('returns no-match for a key that starts no sequence', () => {
    expect(advanceAgdaChord([], ctrlKeydown('z'), table)).toEqual({ status: 'no-match' })
  })

  it('returns partial progress on a valid first step shared by multiple sequences', () => {
    const result = advanceAgdaChord([], ctrlKeydown('c'), table)
    expect(result.status).toBe('partial')
    expect(result.progress).toEqual([{ key: 'c', ctrl: true }])
  })

  it('completes a 2-step sequence', () => {
    const afterC = advanceAgdaChord([], ctrlKeydown('c'), table)
    const result = advanceAgdaChord(afterC.progress, ctrlKeydown('l'), table)
    expect(result).toEqual({
      status: 'complete',
      id: 'load',
      progress: [{ key: 'c', ctrl: true }, { key: 'l', ctrl: true }],
    })
  })

  it('progresses through a 3-step sequence', () => {
    const afterC = advanceAgdaChord([], ctrlKeydown('c'), table)
    const afterX = advanceAgdaChord(afterC.progress, ctrlKeydown('x'), table)
    expect(afterX.status).toBe('partial')
    const result = advanceAgdaChord(afterX.progress, ctrlKeydown('a'), table)
    expect(result.status).toBe('complete')
    expect(result.id).toBe('abort')
  })
})
