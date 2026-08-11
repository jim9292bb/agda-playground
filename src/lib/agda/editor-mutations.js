import { removeGoalInfo } from './effects'
import { getGoalRangeById } from './goals'

/** @import { EditorView } from '@codemirror/view' */

/**
 * @typedef LegacyGoalRange
 * @prop {number} id
 * @prop {number} from
 * @prop {number} to
 * @prop {string} text
 */

/**
 * @param {EditorView} editorView
 * @param {{from: number, to: number}} range
 * @returns {boolean}
 */
function isValidRange(editorView, range) {
  return Number.isFinite(range.from) &&
    Number.isFinite(range.to) &&
    range.from >= 0 &&
    range.from < range.to &&
    range.to <= editorView.state.doc.length
}

/**
 * @param {EditorView} editorView
 * @param {number} interactionPoint
 * @param {LegacyGoalRange | undefined} fallbackGoal
 * @returns {{from: number, to: number} | null}
 */
function resolveGoalRange(editorView, interactionPoint, fallbackGoal) {
  const range = getGoalRangeById(editorView.state, interactionPoint)
  if (range && isValidRange(editorView, range)) return range
  if (fallbackGoal?.id === interactionPoint && isValidRange(editorView, fallbackGoal)) return fallbackGoal
  return null
}

/**
 * @param {string} goalText
 * @returns {string | null}
 */
function goalContent(goalText) {
  const match = goalText.match(/^\{!\s*([\s\S]*?)\s*!\}$/)
  return match ? match[1] : null
}

/**
 * A Give/Refine result can itself contain a bare `?` -- e.g. refining a
 * goal of type `N -> N` with the partial application `s` inserts `s ?`,
 * where `?` marks a fresh sub-goal Agda already knows about (it shows up
 * in the very next Cmd_metas-driven AllGoalsWarnings). Case split's own
 * generated clauses use the same `?` convention for their new goals (see
 * replaceGoalClause below); mirror both things it does for that: convert
 * `?` to the real `{!   !}` hole markup, and dispatch the same
 * 'agda-reload-needed' event so the app automatically reloads and Agda
 * scans + registers the new hole as a clickable interaction point --
 * without this, the `?` sat there as inert text with no Goals panel entry
 * until the user manually reloaded.
 * @param {EditorView} editorView
 * @param {string} text
 * @returns {string}
 */
function convertBareGoalMarkers(editorView, text) {
  if (!text.includes('?')) return text
  editorView.dom.dispatchEvent(new CustomEvent('agda-reload-needed', {
    bubbles: true,
    detail: { reason: 'give-with-new-goal' },
  }))
  return text.replace(/\?/g, '{!   !}')
}

/**
 * @param {EditorView} editorView
 * @param {{from: number, to: number}} range
 * @param {number} interactionPoint
 * @param {string} replacement
 */
function replaceRangeAndRemoveGoal(editorView, range, interactionPoint, replacement) {
  editorView.dispatch({
    changes: { from: range.from, to: range.to, insert: replacement },
    selection: { anchor: range.from + replacement.length },
    effects: removeGoalInfo.of(interactionPoint),
  })
}

/**
 * @param {EditorView} editorView
 * @param {number} interactionPoint
 * @param {string} replacement
 * @param {LegacyGoalRange | undefined} fallbackGoal
 * @returns {boolean}
 */
export function replaceGoal(editorView, interactionPoint, replacement, fallbackGoal) {
  const range = resolveGoalRange(editorView, interactionPoint, fallbackGoal)
  if (!range) return false

  replaceRangeAndRemoveGoal(editorView, range, interactionPoint, convertBareGoalMarkers(editorView, replacement))
  return true
}

/**
 * Implements agda-mode-vscode's GiveNoParen/GiveParen behavior: keep the
 * goal content, optionally parenthesized, then remove `{!` and `!}`.
 *
 * @param {EditorView} editorView
 * @param {number} interactionPoint
 * @param {boolean} paren
 * @param {LegacyGoalRange | undefined} fallbackGoal
 * @returns {boolean}
 */
export function removeGoalBoundary(editorView, interactionPoint, paren, fallbackGoal) {
  const range = resolveGoalRange(editorView, interactionPoint, fallbackGoal)
  if (!range) return false

  const text = editorView.state.doc.sliceString(range.from, range.to)
  const content = goalContent(text)
  if (content === null) return false

  const replacement = paren ? `(${content})` : content
  replaceRangeAndRemoveGoal(editorView, range, interactionPoint, convertBareGoalMarkers(editorView, replacement))
  return true
}

/**
 * @param {EditorView} editorView
 * @param {{from: number, to: number}} goal
 * @param {string[]} clauses
 */
export function replaceGoalClause(editorView, goal, clauses) {
  const doc = editorView.state.doc
  const startLine = doc.lineAt(goal.from)
  const linePrefix = doc.sliceString(startLine.from, goal.from)
  const indentation = linePrefix.match(/^\s*/)?.[0] ?? ''
  const replacement = indentation + clauses
    .map(clause => clause.replace(/\?/g, '{!   !}'))
    .join('\n' + indentation)

  editorView.dispatch({
    changes: { from: startLine.from, to: goal.to, insert: replacement },
    selection: { anchor: startLine.from },
  })
  editorView.dom.dispatchEvent(new CustomEvent('agda-reload-needed', {
    bubbles: true,
    detail: { reason: 'case-split' },
  }))
}
