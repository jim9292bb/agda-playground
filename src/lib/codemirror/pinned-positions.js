import { StateEffect, StateField } from '@codemirror/state'

/**
 * Positions that move with the document's edits, each under its own key:
 * a goal command pins the caret at keypress, so that whatever it waits for
 * first (a notebook's presync re-load) can't redirect it -- a click
 * elsewhere meanwhile moves the selection, not the pin. Emacs's
 * `agda2-goal-cmd` likewise reads the goal at point when the key is
 * pressed.
 */

/** @type {import('@codemirror/state').StateEffectType<{key: symbol, pos: number}>} */
export const pinPosition = StateEffect.define()
/** @type {import('@codemirror/state').StateEffectType<symbol>} */
export const unpinPosition = StateEffect.define()

/** @type {StateField<Map<symbol, number>>} */
export const pinnedPositions = StateField.define({
  create: () => new Map(),
  update(value, tr) {
    let next = value
    if (tr.docChanged && value.size) {
      next = new Map([...value].map(([key, pos]) => [key, tr.changes.mapPos(pos)]))
    }
    for (const effect of tr.effects) {
      if (effect.is(pinPosition)) {
        next = new Map(next).set(effect.value.key, effect.value.pos)
      } else if (effect.is(unpinPosition) && next.has(effect.value)) {
        next = new Map(next)
        next.delete(effect.value)
      }
    }
    return next
  },
})
