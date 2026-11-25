/**
 * Keyboard behavior for a modal dialog (an element with role="dialog" and
 * aria-modal="true"), as an attachment on that element:
 *
 * - focus moves into the dialog when it opens (its first focusable control,
 *   or the dialog itself, which therefore needs tabindex="-1");
 * - Tab / Shift-Tab cycle within the dialog instead of reaching the page
 *   behind it;
 * - Escape closes it, via `onClose`;
 * - once it closes, focus goes back to whatever had it before the dialog
 *   opened -- unless `onClose` already moved focus somewhere on purpose
 *   (e.g. the Settings panel hands it to the editor).
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * @param {HTMLElement} dialog
 * @returns {HTMLElement[]}
 */
export function focusableElementsIn(dialog) {
  return /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll(FOCUSABLE)])
    // Skip controls that aren't rendered (e.g. inside a hidden settings tab).
    .filter(element => element.getClientRects().length > 0)
}

/**
 * @param {() => void} onClose
 * @returns {import('svelte/attachments').Attachment<HTMLElement>}
 */
export function modalDialog(onClose) {
  return dialog => {
    const opener = document.activeElement
    ;(focusableElementsIn(dialog)[0] ?? dialog).focus()

    /** @param {KeyboardEvent} event */
    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableElementsIn(dialog)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        return
      }
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', onKeydown)
    return () => {
      dialog.removeEventListener('keydown', onKeydown)
      const active = document.activeElement
      const focusLost = !active || active === document.body || dialog.contains(active)
      if (focusLost && opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }
}
