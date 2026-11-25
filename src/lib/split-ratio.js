/**
 * A SplitPane ratio remembered in localStorage (see SplitPane.svelte's
 * `ratio`). Out-of-range or unreadable values fall back to the default, and
 * storage failures (private mode, quota) just mean nothing is remembered.
 */

/**
 * @param {string} key
 * @param {number} fallback
 * @param {[number, number]} [range] accepted [min, max]
 */
export function loadSplitRatio(key, fallback, [min, max] = [0, 1]) {
  try {
    const raw = localStorage.getItem(key)
    const saved = raw === null ? NaN : Number(raw)
    return saved >= min && saved <= max ? saved : fallback
  } catch {
    return fallback
  }
}

/** @param {string} key @param {number} ratio */
export function saveSplitRatio(key, ratio) {
  try {
    localStorage.setItem(key, ratio.toFixed(3))
  } catch {
    // Not remembered.
  }
}
