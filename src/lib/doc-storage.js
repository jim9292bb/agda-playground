/**
 * The browser-saved copy of a route's source buffer (Settings > General:
 * "Editor contents are saved in this browser"). Edits are saved shortly
 * after they happen and flushed when the page is hidden, so typed text
 * survives a reload or a closed tab even when no Agda command ran.
 *
 * All reads and writes of the buffer's localStorage entry go through here,
 * which also lets it tell its own saves apart from another tab's.
 */
/** Log text when another tab's newer save replaced this tab's buffer. */
export const OTHER_TAB_ADOPTED_MESSAGE =
  'Loaded the version saved in another tab. Click Load to type-check it.\n'

/** Log text when another tab saved while this tab had unsaved edits. */
export const OTHER_TAB_CONFLICT_MESSAGE =
  'Another tab saved a different version of this document. Your edits here will replace it; reload this page to use the other version instead.\n'

export class DocStorage {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer = undefined
  /** @type {(() => string) | undefined} */
  #pending = undefined

  /**
   * Text this tab last read from or wrote to the current key; the buffer is
   * dirty when it differs.
   * @type {string | null}
   */
  lastSaved = null

  /**
   * @param {{ getKey: () => string, storage?: Storage, delayMs?: number }} options
   */
  constructor({ getKey, storage, delayMs = 400 }) {
    this.getKey = getKey
    this.storage = storage
    this.delayMs = delayMs
  }

  /** @returns {Storage | undefined} */
  #store() {
    try {
      return this.storage ?? globalThis.localStorage
    } catch {
      return undefined
    }
  }

  /**
   * The saved text for the current key, or `fallback` when nothing is saved.
   * @param {string} fallback
   */
  load(fallback) {
    let saved = null
    try {
      saved = this.#store()?.getItem(this.getKey()) ?? null
    } catch {
      saved = null
    }
    this.lastSaved = saved ?? fallback
    return this.lastSaved
  }

  /**
   * Save `text` now, cancelling a scheduled save.
   * @param {string} text
   */
  save(text) {
    this.#cancel()
    try {
      this.#store()?.setItem(this.getKey(), text)
    } catch {
      // Storage full or blocked: keep editing; the buffer just isn't saved.
    }
    this.lastSaved = text
  }

  /**
   * Save the text `getText` returns after a short delay; a later call
   * replaces the pending one.
   * @param {() => string} getText
   */
  schedule(getText) {
    this.#pending = getText
    if (this.#timer !== undefined) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.flush(), this.delayMs)
  }

  /** Run a scheduled save now, if there is one. */
  flush() {
    const getText = this.#pending
    if (getText) this.save(getText())
  }

  /**
   * Record `text` as what is saved, without writing it: for a buffer built
   * from the saved text that differs from it only in form (the notebook
   * reassembles cells, normalising line endings and fences).
   * @param {string} text
   */
  markSaved(text) {
    this.lastSaved = text
  }

  /** @param {string} text */
  isDirty(text) {
    return text !== this.lastSaved
  }

  /**
   * Call `onExternalChange(text)` when another tab saves different text
   * under the current key (the `storage` event fires only in other tabs).
   * @param {(text: string) => void} onExternalChange
   * @param {Window} [win]
   * @returns {() => void} stops watching
   */
  watch(onExternalChange, win = window) {
    /** @param {StorageEvent} event */
    const listener = event => {
      if (event.key !== this.getKey() || event.newValue == null) return
      if (event.newValue === this.lastSaved) return
      onExternalChange(event.newValue)
    }
    win.addEventListener('storage', listener)
    return () => win.removeEventListener('storage', listener)
  }

  /**
   * Take `text`, saved by another tab, as this tab's saved state: drops a
   * pending save of the older buffer without writing anything.
   * @param {string} text
   */
  adopt(text) {
    this.#cancel()
    this.lastSaved = text
  }

  #cancel() {
    if (this.#timer !== undefined) clearTimeout(this.#timer)
    this.#timer = undefined
    this.#pending = undefined
  }
}
