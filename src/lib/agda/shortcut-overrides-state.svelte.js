/**
 * Reactive state behind the Settings panel's shortcut-override editor:
 * the saved overrides, the in-progress drafts, and the status message.
 *
 * Panel visibility, focus restoration and running shortcuts stay in each
 * page, since those differ between the scratchpad and the notebook routes.
 */

import { createAgdaShortcutRegistry, validateAgdaShortcutOverrides } from './shortcuts'
import { cleanShortcutOverrides, loadShortcutOverrides } from './shortcut-overrides'

export class ShortcutOverridesState {
  /** @type {Record<string, string>} */
  overrides = $state({})
  /** @type {Record<string, string>} */
  drafts = $state({})
  message = $state('')
  registry = $derived(createAgdaShortcutRegistry(this.overrides))
  draftValidation = $derived(validateAgdaShortcutOverrides(cleanShortcutOverrides(this.drafts)))

  #storageKey

  /** @param {string} storageKey */
  constructor(storageKey) {
    this.#storageKey = storageKey
    const initial = loadShortcutOverrides(storageKey)
    this.overrides = initial
    this.drafts = { ...initial }
  }

  /** Resets drafts to the saved overrides, e.g. when the panel opens. */
  beginEditing = () => {
    this.drafts = { ...this.overrides }
    this.message = ''
  }

  /**
   * @param {string} id
   * @param {string} value
   */
  setDraft = (id, value) => {
    this.drafts = { ...this.drafts, [id]: value }
    this.message = ''
  }

  /** @param {string} id */
  clearDraft = (id) => {
    const next = { ...this.drafts }
    delete next[id]
    this.drafts = next
    this.message = ''
  }

  save = () => {
    const cleaned = cleanShortcutOverrides(this.drafts)
    const validation = validateAgdaShortcutOverrides(cleaned)
    if (!validation.valid) {
      this.message = validation.errors.join(' ')
      return
    }

    this.overrides = cleaned
    this.drafts = { ...cleaned }
    localStorage.setItem(this.#storageKey, JSON.stringify(cleaned))
    this.message = Object.keys(cleaned).length
      ? 'Shortcut overrides saved.'
      : 'Shortcut overrides cleared.'
  }

  reset = () => {
    this.overrides = {}
    this.drafts = {}
    localStorage.removeItem(this.#storageKey)
    this.message = 'Shortcut overrides reset to defaults.'
  }
}
