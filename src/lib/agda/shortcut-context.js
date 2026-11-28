import { getGoalAtPosition } from './goals'
import { extractGoalInput } from './goal-state'
import { goalContentToAgdaRange, noAgdaRange } from './ranges'

/** @import { EditorView } from '@codemirror/view' */

/**
 * @typedef AgdaShortcutGoal
 * @prop {number} id
 * @prop {number} from
 * @prop {number} to
 * @prop {string} text
 */

/**
 * @typedef AgdaShortcutContext
 * @prop {AgdaShortcutGoal | null} goal
 * @prop {string} input
 * @prop {string} range
 */

/**
 * @param {EditorView} view
 * @param {string} currentFilePath
 * @param {string} [agdaVersion] the running ALS's numeric Agda version
 *   (e.g. "2.7.0.1") — determines the Interval wire format; see
 *   formatAgdaRange in ranges.js.
 * @param {number} [pos] where the command was issued, if not the caret
 * @returns {AgdaShortcutContext}
 */
export function getAgdaShortcutContext(view, currentFilePath, agdaVersion, pos = view.state.selection.main.head) {
  const docLength = view.state.doc.length
  const head = Math.max(0, Math.min(pos, docLength))
  const previousPos = Math.max(0, head - 1)
  const nextPos = Math.min(docLength, head + 1)
  // Only goals in goal state count. A `{! !}` that is merely text (restored
  // by undo, pasted, or in a comment) is not an interaction point, and
  // pairing it with some goal id sent the command to a different goal.
  // agda-mode-vscode and Emacs likewise act only on goals they track.
  const goal =
    getGoalAtPosition(view.state, head) ??
    getGoalAtPosition(view.state, previousPos) ??
    getGoalAtPosition(view.state, nextPos)

  return {
    goal,
    // Only the goal's own content, never a selection -- as in agda-mode-vscode,
    // where (like here, see chordYieldsToSelection) a selection keeps the
    // Agda chords from firing at all. Commands that need input outside a
    // goal prompt for it instead.
    input: goal ? extractGoalInput(goal.text) : '',
    range: goal ? goalContentToAgdaRange(view.state, currentFilePath, goal, agdaVersion) : noAgdaRange,
  }
}
