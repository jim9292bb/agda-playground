/// <reference types="vitest/globals" />

import { prefersDarkTheme } from './theme'

describe('prefersDarkTheme', () => {
  it('returns true when the media query matches', () => {
    const win = { matchMedia: (_q: string) => ({ matches: true }) }
    expect(prefersDarkTheme(win)).toBe(true)
  })

  it('returns false when the media query does not match', () => {
    const win = { matchMedia: (_q: string) => ({ matches: false }) }
    expect(prefersDarkTheme(win)).toBe(false)
  })

  it('queries for the "prefers-color-scheme: dark" media feature', () => {
    let seenQuery = ''
    const win = {
      matchMedia: (q: string) => {
        seenQuery = q
        return { matches: false }
      },
    }
    prefersDarkTheme(win)
    expect(seenQuery).toBe('(prefers-color-scheme: dark)')
  })
})
