/// <reference types="vitest/globals" />

import { cleanShortcutOverrides, loadShortcutOverrides } from './shortcut-overrides'

const KEY = 'test.shortcut-overrides'

/** @param {Record<string, string>} initial */
function stubLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (/** @type {string} */ k) => store.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(k, v),
    removeItem: (/** @type {string} */ k) => store.delete(k),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadShortcutOverrides', () => {
  it('returns {} when localStorage is unavailable', () => {
    expect(loadShortcutOverrides(KEY)).toEqual({})
  })

  it('returns {} for a missing key', () => {
    stubLocalStorage()
    expect(loadShortcutOverrides(KEY)).toEqual({})
  })

  it('returns {} for malformed JSON, arrays and non-objects', () => {
    for (const raw of ['{not json', '["C-c C-l"]', '"x"', 'null']) {
      stubLocalStorage({ [KEY]: raw })
      expect(loadShortcutOverrides(KEY)).toEqual({})
    }
  })

  it('keeps only string values', () => {
    stubLocalStorage({ [KEY]: JSON.stringify({ load: 'C-c C-x', give: 3, refine: null }) })
    expect(loadShortcutOverrides(KEY)).toEqual({ load: 'C-c C-x' })
  })

  it('reads only its own key', () => {
    stubLocalStorage({ other: JSON.stringify({ load: 'C-c C-x' }) })
    expect(loadShortcutOverrides(KEY)).toEqual({})
  })
})

describe('cleanShortcutOverrides', () => {
  it('trims values and drops empty entries and unknown ids', () => {
    expect(cleanShortcutOverrides({
      load: '  C-c C-x  ',
      give: '   ',
      'no-such-shortcut': 'C-c C-z',
    })).toEqual({ load: 'C-c C-x' })
  })
})
