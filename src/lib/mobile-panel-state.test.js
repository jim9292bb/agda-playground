/// <reference types="vitest/globals" />

import { MobilePanelState, isKeyboardOpen } from './mobile-panel-state.svelte'

/** A window whose visual viewport can be shrunk by a fake on-screen keyboard. */
function fakeWindow() {
  /** @type {(() => void) | undefined} */
  let onResize
  const win = {
    innerHeight: 844,
    visualViewport: {
      height: 844,
      /** @param {string} _type @param {() => void} fn */
      addEventListener: (_type, fn) => { onResize = fn },
      removeEventListener: () => { onResize = undefined },
    },
    document: { activeElement: /** @type {{ closest: (s: string) => unknown } | null} */ (null) },
  }
  return {
    win,
    /** @param {boolean} open @param {boolean} [inPanel] */
    keyboard(open, inPanel = false) {
      win.document.activeElement = { closest: () => (inPanel ? {} : null) }
      win.visualViewport.height = open ? 500 : 844
      onResize?.()
    },
  }
}

describe('isKeyboardOpen', () => {
  it('needs the visual viewport to be well short of the window', () => {
    expect(isKeyboardOpen(844, 500)).toBe(true)
    expect(isKeyboardOpen(844, 800)).toBe(false)
  })
})

describe('MobilePanelState', () => {
  it('collapses while the keyboard is up and reopens after', () => {
    const state = new MobilePanelState()
    const { win, keyboard } = fakeWindow()
    state.watchKeyboard(/** @type {any} */ (win))
    expect(state.collapsed).toBe(false)
    keyboard(true)
    expect(state.collapsed).toBe(true)
    keyboard(false)
    expect(state.collapsed).toBe(false)
  })

  it('stays open when the keyboard is for the panel itself (a prompt)', () => {
    const state = new MobilePanelState()
    const { win, keyboard } = fakeWindow()
    state.watchKeyboard(/** @type {any} */ (win))
    keyboard(true, true)
    expect(state.collapsed).toBe(false)
  })

  it("keeps the user's choice until the keyboard next changes", () => {
    const state = new MobilePanelState()
    const { win, keyboard } = fakeWindow()
    state.watchKeyboard(/** @type {any} */ (win))
    keyboard(true)
    state.expand()
    expect(state.collapsed).toBe(false)
    keyboard(false)
    keyboard(true)
    expect(state.collapsed).toBe(true)
  })

  it('opens on Goals for a prompt, switches to Messages for results', () => {
    const state = new MobilePanelState()
    state.toggleCollapsed()
    state.tab = 'messages'
    state.showPrompt()
    expect(state.tab).toBe('goals')
    expect(state.collapsed).toBe(false)
    state.showMessages()
    expect(state.tab).toBe('messages')
  })
})
