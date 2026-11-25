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

// Everything code is drawn on: the editor, notebook code cells, and the
// focused notebook cell.
const codeSurfaces = ['quiet-neutral-fill', 'quiet-neutral-fill-softer', 'app-code-fill', 'app-cell-focus-fill'].map(token)
// Everything UI text is drawn on.
const uiSurfaces = ['quiet-neutral-fill', 'quiet-neutral-fill-softer', 'quiet-messages-fill', 'app-code-fill'].map(token)

/**
 * The text colors of a palette spec: rules that set a hex `color` without a
 * background of their own (those that do are highlight overlays, not text).
 * @param {Record<string, Record<string, string>>} spec
 */
function textColors(spec) {
  return Object.entries(spec)
    .filter(([, style]) => /^#[0-9a-fA-F]{3,6}$/.test(style.color ?? '') && !style.backgroundColor && !style.background)
    .map(([selector, style]) => [selector, style.color])
}

describe('Agda highlighting palettes meet WCAG AA (4.5:1)', () => {
  it.each([
    ['light', agdaLightSchemeSpec, 0],
    ['dark', agdaDarkSchemeSpec, 1],
  ])('%s palette, on every code surface', (_name, spec, scheme) => {
    const failures = []
    for (const [selector, color] of textColors(/** @type {any} */ (spec))) {
      for (const surface of codeSurfaces) {
        const ratio = contrast(color, surface[scheme])
        if (ratio < 4.5) failures.push(`${selector} ${color} on ${surface[scheme]}: ${ratio.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('UI text colors meet WCAG AA (4.5:1)', () => {
  const textTokens = [
    'app-text-strong', 'app-text', 'app-text-secondary', 'app-text-muted',
    'app-success-text', 'app-warning-text', 'app-danger-text',
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
})
