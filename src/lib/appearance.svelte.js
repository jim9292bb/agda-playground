/**
 * The app-wide light/dark appearance: follow the operating system (the
 * default), or force light or dark from Settings. Shared by every route.
 *
 * The page's own colors follow through CSS alone -- theme.css resolves every
 * color with `light-dark()` against `color-scheme`, which `data-theme` on
 * <html> pins when a choice is forced (src/app.html stamps it before first
 * paint from the same storage key, so a forced theme doesn't flash).
 * CodeMirror needs to be told explicitly (its dark base-theme variant and the
 * Agda highlighting palette are extensions, not CSS): see
 * `onAppearanceChange` and src/lib/codemirror/theme.ts's autoColorScheme.
 */

import { untrack } from 'svelte'

/** @typedef {'system' | 'light' | 'dark'} AppearancePreference */

export const APPEARANCE_STORAGE_KEY = 'agda-playground.appearance.v1'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const CHANGE_EVENT = 'agda-playground:appearance-change'

/** @param {unknown} value @returns {value is AppearancePreference} */
function isPreference(value) {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** @returns {AppearancePreference} */
function readStoredPreference() {
  try {
    const stored = globalThis.localStorage?.getItem(APPEARANCE_STORAGE_KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

/** @param {AppearancePreference} preference */
function applyToDocument(preference) {
  const root = globalThis.document?.documentElement
  if (!root) return
  if (preference === 'system') delete root.dataset.theme
  else root.dataset.theme = preference
}

/**
 * Whether the app is dark right now, for a given preference.
 * @param {AppearancePreference} preference
 * @param {{ matchMedia?: (query: string) => { matches: boolean } }} [win]
 */
export function resolvesToDark(preference, win = globalThis) {
  if (preference !== 'system') return preference === 'dark'
  return typeof win.matchMedia === 'function' && win.matchMedia(DARK_QUERY).matches
}

class AppearanceState {
  /** @type {AppearancePreference} */
  preference = $state(readStoredPreference())

  /** @param {AppearancePreference} preference */
  set = preference => {
    if (!isPreference(preference)) return
    this.preference = preference
    try {
      if (preference === 'system') globalThis.localStorage?.removeItem(APPEARANCE_STORAGE_KEY)
      else globalThis.localStorage?.setItem(APPEARANCE_STORAGE_KEY, preference)
    } catch {
      // Storage unavailable (private mode, quota): the choice still applies
      // to this page, it just won't persist.
    }
    applyToDocument(preference)
    globalThis.dispatchEvent?.(new Event(CHANGE_EVENT))
  }

  /**
   * Whether the app is currently dark (the preference, or the OS for
   * "system"). Deliberately untracked: editors read this while being built
   * inside a Svelte attachment, and tracking it there would make every
   * appearance change rebuild the whole EditorView (losing its Agda
   * highlighting) instead of letting autoColorScheme switch it in place.
   */
  isDark = () => untrack(() => resolvesToDark(this.preference))
}

export const appearance = new AppearanceState()

/**
 * Calls `callback` with the new dark/light state whenever it changes, from
 * either Settings or (while following the system) the OS setting.
 * @param {(dark: boolean) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onAppearanceChange(callback) {
  const notify = () => callback(appearance.isDark())
  const media = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(DARK_QUERY) : null
  media?.addEventListener('change', notify)
  globalThis.addEventListener?.(CHANGE_EVENT, notify)
  return () => {
    media?.removeEventListener('change', notify)
    globalThis.removeEventListener?.(CHANGE_EVENT, notify)
  }
}
