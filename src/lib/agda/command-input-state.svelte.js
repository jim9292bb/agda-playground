/**
 * Reactive state behind the Goals panel's command-input prompt: the
 * pending command waiting for user input, its validation error, and the
 * input element to focus when it opens.
 *
 * The two pages differ only in which document the prompt's staleness check
 * reads (`/`'s single editor vs the notebook's hidden composite view) and
 * which editor gets focus back afterwards, so those are injected.
 */

import { tick } from 'svelte'
import { getAgdaDocumentVersion } from './goal-state'
import { runAgdaCommand } from './run-shortcut'

/** @import { EditorState } from '@codemirror/state' */
/** @import { AgdaShortcutContext } from './shortcut-context' */
/** @import { AgdaShortcutHooks } from './run-shortcut' */
/** @import { AgdaController } from '$lib/controller.svelte' */

/** @typedef {(context: AgdaShortcutContext, input: string) => string | Promise<void>} InputCommand */

/**
 * @typedef {object} CommandInputPrompt
 * @prop {string} label
 * @prop {string} value
 * @prop {number} documentVersion
 * @prop {AgdaShortcutContext} context
 * @prop {InputCommand} command
 * @prop {AgdaShortcutHooks} hooks
 */

export class CommandInputState {
  /** @type {CommandInputPrompt | null} */
  prompt = $state(null)
  error = $state('')
  /** @type {HTMLInputElement | undefined} */
  element = $state(undefined)

  #agdaController
  #getDocState
  #focusEditor
  #appendLog

  /**
   * @param {{
   *   agdaController: AgdaController,
   *   getDocState: () => EditorState | undefined,
   *   focusEditor: () => void,
   *   appendLog: (text: string) => void,
   * }} opts
   */
  constructor({ agdaController, getDocState, focusEditor, appendLog }) {
    this.#agdaController = agdaController
    this.#getDocState = getDocState
    this.#focusEditor = focusEditor
    this.#appendLog = appendLog
  }

  /**
   * Matches run-shortcut.js's `onNeedsInput` callback shape; the view
   * argument is unused because the document comes from `getDocState`.
   * @param {string} label
   * @param {unknown} _view
   * @param {AgdaShortcutContext} context
   * @param {InputCommand} command
   * @param {AgdaShortcutHooks} hooks
   */
  open = (label, _view, context, command, hooks) => {
    const state = this.#getDocState()
    if (!state) {
      this.#appendLog(`${label} failed: the editor is not ready.\n`)
      return
    }
    this.error = ''
    this.prompt = {
      label,
      value: '',
      documentVersion: getAgdaDocumentVersion(state),
      command,
      context,
      hooks,
    }
    this.#appendLog(`${label}: enter command input in the Goals panel.\n`)
    void tick().then(() => this.element?.focus())
  }

  cancel = () => {
    const label = this.prompt?.label
    this.prompt = null
    if (label) this.#appendLog(`${label} cancelled.\n`)
    this.#focusEditor()
  }

  submit = () => {
    void (async () => {
      const prompt = this.prompt
      const state = this.#getDocState()
      if (!prompt || !state) return

      const input = prompt.value.trim()
      if (!input) {
        this.error = 'Enter an expression before submitting.'
        return
      }

      if (getAgdaDocumentVersion(state) !== prompt.documentVersion) {
        this.prompt = null
        this.#appendLog(`${prompt.label} failed: Reload or retry because the editor changed while the prompt was open.\n`)
        this.#focusEditor()
        return
      }

      this.error = ''
      this.prompt = null
      try {
        await runAgdaCommand({
          label: prompt.label,
          agdaController: this.#agdaController,
          appendLog: this.#appendLog,
          hooks: prompt.hooks,
          build: () => prompt.command(prompt.context, input),
        })
      } finally {
        this.#focusEditor()
      }
    })()
  }

  /** Drops any open prompt, e.g. on Load or when the source is replaced. */
  clear = () => {
    this.prompt = null
    this.error = ''
  }
}
