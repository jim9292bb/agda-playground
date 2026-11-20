/**
 * Pure helpers for user shortcut overrides persisted in localStorage.
 * Shared by the scratchpad route and the notebook routes, which differ
 * only in the storage key they pass in.
 */

import { agdaShortcutRegistry } from './shortcuts'

const agdaShortcutIds = new Set(agdaShortcutRegistry.map(shortcut => shortcut.id))

/**
 * Reads saved overrides, tolerating missing storage and malformed data.
 * @param {string} storageKey
 * @returns {Record<string, string>}
 */
export function loadShortcutOverrides(storageKey) {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === 'string')
    )
  } catch {
    return {}
  }
}

/**
 * Trims values and drops empty entries and unknown shortcut ids.
 * @param {Record<string, string>} overrides
 * @returns {Record<string, string>}
 */
export function cleanShortcutOverrides(overrides) {
  return Object.fromEntries(
    Object.entries(overrides)
      .map(([id, value]) => [id, value.trim()])
      .filter(([id, value]) => agdaShortcutIds.has(id) && value)
  )
}
