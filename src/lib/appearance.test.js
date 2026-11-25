/// <reference types="vitest/globals" />

import { resolvesToDark } from './appearance.svelte'

describe('resolvesToDark', () => {
  const osDark = { matchMedia: () => ({ matches: true }) }
  const osLight = { matchMedia: () => ({ matches: false }) }

  it('follows the OS setting for "system"', () => {
    expect(resolvesToDark('system', osDark)).toBe(true)
    expect(resolvesToDark('system', osLight)).toBe(false)
  })

  it('ignores the OS setting when light or dark is forced', () => {
    expect(resolvesToDark('dark', osLight)).toBe(true)
    expect(resolvesToDark('light', osDark)).toBe(false)
  })

  it('falls back to light without matchMedia', () => {
    expect(resolvesToDark('system', {})).toBe(false)
  })
})
