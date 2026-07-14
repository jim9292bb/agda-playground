import { offsetTable, utf16PosToUtf8 } from '$lib/codemirror/offsets'

/** @import { EditorState } from '@codemirror/state' */

export const noAgdaRange = 'noRange'

/**
 * @typedef AgdaPointOptions
 * @prop {number} [utf8Delta]
 * @prop {number} [columnDelta]
 */

/**
 * Clamp offsets to both the current document and the committed offset table
 * document. Agda ranges are computed against committed UTF-8 offsets.
 *
 * @param {EditorState} state
 * @param {number} offset
 */
function clampOffsetToCommittedDoc(state, offset) {
  const committedDocLength = state.field(offsetTable).doc.length
  return Math.max(0, Math.min(offset, state.doc.length, committedDocLength))
}

/**
 * @param {EditorState} state
 * @param {number} offset
 * @param {AgdaPointOptions} [options]
 */
function cmOffsetToAgdaPoint(state, offset, options = {}) {
  const clampedOffset = clampOffsetToCommittedDoc(state, offset)
  const line = state.doc.lineAt(clampedOffset)
  const utf8Offset = utf16PosToUtf8(state, clampedOffset)
  if (utf8Offset < 0) {
    throw new RangeError(`Cannot convert UTF-16 offset ${clampedOffset} inside a surrogate pair to an Agda UTF-8 position.`)
  }

  return {
    index: utf8Offset + (options.utf8Delta ?? 0),
    row: line.number,
    column: clampedOffset - line.from + (options.columnDelta ?? 0),
  }
}

/**
 * Agda's `Interval'` record gained a third field (the file, hoisted out of
 * its two `Position'` fields) in 2.8.0 (agda/agda#7610) — the textual
 * `Read`-instance literal is only accepted by the version it matches:
 *   Agda < 2.8:  Interval (Pn () idx row col) (Pn () idx row col)
 *   Agda ≥ 2.8:  Interval () (Pn () idx row col) (Pn () idx row col)
 * A version an interaction command is sent to that doesn't match crashes
 * with `CmdErrCannotParseCommand` and the command is silently dropped.
 *
 * @param {string | undefined} agdaVersion e.g. "2.7.0.1" — undefined is
 *   treated as ≥ 2.8 (the shipped default) to preserve prior behavior.
 */
function isAgdaVersionAtLeast28(agdaVersion) {
  const match = /^(\d+)\.(\d+)/.exec(agdaVersion ?? '')
  if (!match) return true
  const [, major, minor] = match
  return Number(major) > 2 || (Number(major) === 2 && Number(minor) >= 8)
}

/**
 * @param {string} filepath
 * @param {ReturnType<typeof cmOffsetToAgdaPoint>} start
 * @param {ReturnType<typeof cmOffsetToAgdaPoint>} end
 * @param {string} [agdaVersion]
 */
export function formatAgdaRange(filepath, start, end, agdaVersion) {
  const startPn = `(Pn () ${start.index} ${start.row} ${start.column})`
  const endPn = `(Pn () ${end.index} ${end.row} ${end.column})`
  const interval = isAgdaVersionAtLeast28(agdaVersion)
    ? `Interval () ${startPn} ${endPn}`
    : `Interval ${startPn} ${endPn}`
  return `(intervalsToRange (Just (mkAbsolute ${JSON.stringify(filepath)})) [${interval}])`
}

/**
 * @param {EditorState} state
 * @param {string} filepath
 * @param {number} from
 * @param {number} to
 * @param {{start?: AgdaPointOptions, end?: AgdaPointOptions}} [options]
 * @param {string} [agdaVersion]
 */
function cmOffsetsToAgdaRange(state, filepath, from, to, options = {}, agdaVersion) {
  return formatAgdaRange(
    filepath,
    cmOffsetToAgdaPoint(state, from, options.start),
    cmOffsetToAgdaPoint(state, to, options.end),
    agdaVersion,
  )
}

/**
 * Mirrors banacorn/agda-mode-vscode's Goal.makeHaskellRange for Agda 2.8;
 * see formatAgdaRange for how the wire format is adjusted for older versions.
 * The range covers only the content inside `{!` and `!}`.
 *
 * @param {EditorState} state
 * @param {string} filepath
 * @param {{outerFrom: number, outerTo: number} | {from: number, to: number}} goal
 * @param {string} [agdaVersion]
 */
export function goalContentToAgdaRange(state, filepath, goal, agdaVersion) {
  const from = 'outerFrom' in goal ? goal.outerFrom : goal.from
  const to = 'outerTo' in goal ? goal.outerTo : goal.to
  return cmOffsetsToAgdaRange(state, filepath, from, to, {
    start: { utf8Delta: 3, columnDelta: 3 },
    end: { utf8Delta: -3, columnDelta: -1 },
  }, agdaVersion)
}

