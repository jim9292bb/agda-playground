/// <reference types="vitest/globals" />

import { formatAgdaRange } from './ranges'

const start = { index: 10, row: 2, column: 3 }
const end = { index: 20, row: 2, column: 13 }

describe('formatAgdaRange', () => {
  it('omits the Interval file field for Agda versions before 2.8', () => {
    const result = formatAgdaRange('/source.agda', start, end, '2.7.0.1')
    expect(result).toBe(
      '(intervalsToRange (Just (mkAbsolute "/source.agda")) [Interval (Pn () 10 2 3) (Pn () 20 2 13)])'
    )
  })

  it('includes the Interval file field for Agda 2.8 and later', () => {
    const result = formatAgdaRange('/source.agda', start, end, '2.8.0')
    expect(result).toBe(
      '(intervalsToRange (Just (mkAbsolute "/source.agda")) [Interval () (Pn () 10 2 3) (Pn () 20 2 13)])'
    )
  })

  it('treats an undefined agdaVersion as >= 2.8 (the shipped default)', () => {
    const result = formatAgdaRange('/source.agda', start, end, undefined)
    expect(result).toContain('Interval ()')
  })

  it('treats an unparseable agdaVersion string as >= 2.8', () => {
    const result = formatAgdaRange('/source.agda', start, end, 'not-a-version')
    expect(result).toContain('Interval ()')
  })

  it('compares major.minor, not string order (2.10 is newer than 2.8, unlike lexically)', () => {
    const result = formatAgdaRange('/source.agda', start, end, '2.10.0')
    expect(result).toContain('Interval ()')
  })

  it('treats Agda 3.x as >= 2.8', () => {
    const result = formatAgdaRange('/source.agda', start, end, '3.0.0')
    expect(result).toContain('Interval ()')
  })

  it('treats Agda 1.x as < 2.8', () => {
    const result = formatAgdaRange('/source.agda', start, end, '1.9.0')
    expect(result).not.toContain('Interval ()')
  })

  it('JSON-encodes the filepath, escaping special characters', () => {
    const result = formatAgdaRange('/a "quoted" path.agda', start, end, '2.8.0')
    expect(result).toContain('(mkAbsolute "/a \\"quoted\\" path.agda")')
  })
})
