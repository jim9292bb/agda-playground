/**
 * Phones (see AgdaSidePanel's `mobile` mode): the editor sits over the Agda
 * panel, which shows Goals or Messages and can collapse to a one-line
 * summary. While the on-screen keyboard is up it collapses on its own, so
 * the editor keeps the room -- unless focus is inside the panel (typing
 * into a command's prompt), which keeps it open. Tapping the summary or the
 * chevron overrides that until the keyboard next opens or closes.
 */

/**
 * Whether an on-screen keyboard is taking up the bottom of the window: the
 * visual viewport (what's left above the keyboard) is much shorter than the
 * layout viewport.
 * @param {number} innerHeight window.innerHeight
 * @param {number} visualHeight visualViewport.height
 */
export function isKeyboardOpen(innerHeight, visualHeight) {
  return innerHeight - visualHeight > 150
}

export class MobilePanelState {
  /** @type {'goals' | 'messages'} */
  tab = $state('goals')
  keyboardOpen = $state(false)
  /** The user's own collapse choice; null follows the keyboard. */
  #collapsedOverride = $state(/** @type {boolean | null} */ (null))

  collapsed = $derived(this.#collapsedOverride ?? this.keyboardOpen)

  toggleCollapsed = () => {
    this.#collapsedOverride = !this.collapsed
  }

  expand = () => {
    this.#collapsedOverride = false
  }

  /** A command is asking for input: show its prompt. */
  showPrompt = () => {
    this.tab = 'goals'
    this.#collapsedOverride = false
  }

  /** A query result or diagnostic arrived. */
  showMessages = () => {
    this.tab = 'messages'
  }

  /**
   * Follows the on-screen keyboard through `visualViewport`.
   * @param {Window} win
   * @returns {() => void} stops watching
   */
  watchKeyboard(win) {
    const viewport = win.visualViewport
    if (!viewport) return () => {}
    const update = () => {
      const open = isKeyboardOpen(win.innerHeight, viewport.height)
      if (open === this.keyboardOpen) return
      this.keyboardOpen = open
      const typingInPanel = Boolean(win.document.activeElement?.closest('.agda-side-panel'))
      this.#collapsedOverride = open && typingInPanel ? false : null
    }
    viewport.addEventListener('resize', update)
    update()
    return () => viewport.removeEventListener('resize', update)
  }
}
