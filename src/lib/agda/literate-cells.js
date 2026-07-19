/**
 * Cell model for the literate-programming route's Jupyter-style rewrite: an
 * ordered array of markdown/code cells, each with its own CodeMirror
 * EditorView, is the source of truth for the UI. A cell's own text NEVER
 * contains fence syntax -- fences are synthesized only when assembling the
 * cells into the one logical `.lagda.md` document that gets sent to Agda
 * (see `assembleDocument`). This is what lets a single fence-guard/
 * fence-hiding layer (the old single-buffer implementation's
 * literate-fence-guard.js / literate-block-borders.js) be deleted outright:
 * there is no fence text anywhere a cell's own editor could show or a user
 * could accidentally type into.
 *
 * `literate-blocks.js`'s `parseLiterateBlocks`/`isFenceLine` are still used
 * here (import parsing, see `cellsFromParsedBlocks`) and unchanged elsewhere
 * (truncation, against the assembled document's text) -- this module only
 * adds what's new for the cell array itself.
 */

/**
 * @typedef LiterateCell
 * @prop {string} id
 * @prop {'markdown' | 'code'} type
 * @prop {string} text plain content, never includes fence syntax
 */

/**
 * @typedef CellContentOffset
 * @prop {string} cellId
 * @prop {'markdown' | 'code'} type
 * @prop {number} from inclusive start of this cell's own text within the
 *   assembled document (excludes any fence wrapper)
 * @prop {number} to exclusive end of this cell's own text within the
 *   assembled document
 */

let nextCellId = 0

/** @returns {string} */
function makeCellId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  nextCellId += 1
  return `cell-${nextCellId}`
}

/**
 * @param {string} [text]
 * @returns {LiterateCell}
 */
export function createMarkdownCell(text = '') {
  return { id: makeCellId(), type: 'markdown', text }
}

/**
 * @param {string} [text]
 * @returns {LiterateCell}
 */
export function createCodeCell(text = '') {
  return { id: makeCellId(), type: 'code', text }
}

const CODE_FENCE_OPEN = '```agda\n'
const CODE_FENCE_CLOSE = '\n```\n\n'
const MARKDOWN_SUFFIX = '\n\n'

/**
 * Joins the cell array into one logical `.lagda.md` document -- what gets
 * sent to Agda and what an export downloads. Every fence is synthesized
 * here; no cell's own text ever contributes fence syntax.
 * @param {LiterateCell[]} cells
 * @returns {string}
 */
export function assembleDocument(cells) {
  return cells
    .map(cell => (cell.type === 'code' ? CODE_FENCE_OPEN + cell.text + CODE_FENCE_CLOSE : cell.text + MARKDOWN_SUFFIX))
    .join('')
}

/**
 * For each cell, the `[from, to)` range its own text (excluding any fence
 * wrapper) occupies within `assembleDocument(cells)`'s output -- the lookup
 * table used to translate an absolute offset in the assembled/hidden
 * document (an Agda goal, a highlighting span, a diagnostic jump target)
 * into "which cell, and what local offset within it".
 * @param {LiterateCell[]} cells
 * @returns {CellContentOffset[]}
 */
export function computeCellContentOffsets(cells) {
  /** @type {CellContentOffset[]} */
  const offsets = []
  let pos = 0
  for (const cell of cells) {
    if (cell.type === 'code') {
      const from = pos + CODE_FENCE_OPEN.length
      const to = from + cell.text.length
      offsets.push({ cellId: cell.id, type: cell.type, from, to })
      pos = to + CODE_FENCE_CLOSE.length
    } else {
      const from = pos
      const to = from + cell.text.length
      offsets.push({ cellId: cell.id, type: cell.type, from, to })
      pos = to + MARKDOWN_SUFFIX.length
    }
  }
  return offsets
}

/**
 * @param {CellContentOffset[]} offsets
 * @param {number} pos absolute offset in the assembled document
 * @returns {CellContentOffset | null} the cell whose content range contains
 *   `pos`, clamping to the nearest cell's edge if `pos` falls inside a
 *   synthesized fence wrapper or separator (never returns null unless
 *   `offsets` is empty)
 */
export function cellOffsetAtPos(offsets, pos) {
  if (offsets.length === 0) return null
  for (let i = 0; i < offsets.length; i++) {
    const entry = offsets[i]
    if (pos < entry.to) return entry
    const next = offsets[i + 1]
    if (!next || pos < next.from) return entry
  }
  return offsets[offsets.length - 1]
}

/**
 * Import support: turns a parsed `.lagda.md` (via `parseLiterateBlocks`
 * from literate-blocks.js) into a cell array, stripping each code block's
 * own fence wrapper down to plain content (a cell's text never includes
 * fence syntax). A code block with no closing fence (mid-edit / malformed
 * import) keeps everything after the opening fence line as content.
 * @param {string} text
 * @param {import('./literate-blocks').LiterateBlock[]} blocks
 * @returns {LiterateCell[]}
 */
export function cellsFromParsedBlocks(text, blocks) {
  return blocks.map(block => {
    const slice = text.slice(block.from, block.to)
    if (block.type === 'markdown') return createMarkdownCell(slice.replace(/\n+$/, ''))

    const firstNewline = slice.indexOf('\n')
    const afterOpenFence = firstNewline === -1 ? slice.length : firstNewline + 1
    const closesWithFence = /\n```\n?$/.test(slice)
    const body = closesWithFence ? slice.slice(afterOpenFence).replace(/\n```\n?$/, '') : slice.slice(afterOpenFence).replace(/\n$/, '')
    return createCodeCell(body)
  })
}
