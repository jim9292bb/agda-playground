/// <reference types="vitest/globals" />

import { readFileSync } from 'node:fs'
import { agdaDarkSchemeSpec, agdaLightSchemeSpec } from './color-scheme'

// WCAG 2 relative luminance and contrast ratio.
/** @param {string} hex */
function luminance(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map(c => c + c).join('')
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The theme tokens, as [light, dark] pairs, straight from theme.css.
const themeCss = readFileSync(new URL('../theme.css', import.meta.url), 'utf8')
/** @param {string} name @returns {[string, string]} */
function token(name) {
  const match = themeCss.match(new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-fA-F]{3,6}),\\s*(#[0-9a-fA-F]{3,6})\\)`))
  if (!match) throw new Error(`theme.css has no plain light-dark() hex pair for --${name}`)
  return [match[1], match[2]]
}

// Everything UI text is drawn on.
const uiSurfaces = ['quiet-neutral-fill', 'quiet-neutral-fill-softer', 'app-code-fill', 'app-chrome', 'app-panel', 'app-canvas', 'app-cell-focus-fill', 'app-switcher-track'].map(token)

// The Agda highlighting palettes copy Agda's Emacs mode (color-scheme.js), so
// they are deliberately not held to WCAG AA as a whole: some of Emacs's colors
// fall short of it on this app's backgrounds. The dark palette's exceptions
// to Emacs -- numbers, and the hole and problem fills -- are what's checked.
describe('Agda highlighting palettes', () => {
  it('style the same selectors in light and dark', () => {
    expect(Object.keys(agdaDarkSchemeSpec).sort()).toEqual(Object.keys(agdaLightSchemeSpec).sort())
  })

  const dark = /** @type {Record<string, Record<string, string>>} */ (agdaDarkSchemeSpec)
  const darkCodeSurfaces = ['quiet-neutral-fill', 'quiet-neutral-fill-softer', 'app-cell-focus-fill', 'app-active-line'].map(name => token(name)[1])
  const darkText = [
    ...Object.entries(dark).filter(([, style]) => /^#/.test(style.color ?? '') && !style.backgroundColor).map(([selector, style]) => [selector, style.color]),
    ['plain text', token('app-text')[1]],
  ]

  it('dark numbers meet AA on every code surface', () => {
    for (const surface of darkCodeSurfaces) {
      expect(contrast(dark['.agda-number'].color, surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('dark hole and problem fills keep text as legible as on the editor (up to AA)', () => {
    const editor = token('quiet-neutral-fill')[1]
    const failures = []
    for (const [overlay, style] of Object.entries(dark)) {
      if (!style.backgroundColor || style.color) continue
      for (const [selector, color] of darkText) {
        const ratio = contrast(color, style.backgroundColor)
        const floor = Math.min(4.5, contrast(color, editor))
        if (ratio < floor - 0.01) failures.push(`${selector} ${color} on ${overlay} ${style.backgroundColor}: ${ratio.toFixed(2)} < ${floor.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('UI text colors meet WCAG AA (4.5:1)', () => {
  const textTokens = [
    'app-text-strong', 'app-text', 'app-text-secondary', 'app-text-muted',
    'app-success-text', 'app-warning-text', 'app-danger-text', 'quiet-primary-text',
  ]

  it.each([['light', 0], ['dark', 1]])('%s scheme, on every UI surface', (_name, scheme) => {
    const failures = []
    for (const name of textTokens) {
      const color = token(name)[scheme]
      for (const surface of uiSurfaces) {
        const ratio = contrast(color, surface[scheme])
        if (ratio < 4.5) failures.push(`--${name} ${color} on ${surface[scheme]}: ${ratio.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })

  it.each([['light', 0], ['dark', 1]])('%s scheme, accent text on its own soft fill', (_name, scheme) => {
    const ratio = contrast(token('quiet-primary-text')[scheme], token('quiet-primary-fill-soft')[scheme])
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it.each([['light', 0], ['dark', 1]])('%s scheme, warning text on its badge fill', (_name, scheme) => {
    const ratio = contrast(token('app-warning-text')[scheme], token('app-warning-fill')[scheme])
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})
