/**
 * Splits a `.lagda.md`-shaped document into an ordered sequence of markdown
 * and Agda-code blocks. This app is the sole author of every fence it ever
 * writes (blocks are only ever created via its own add-block action, and
 * imported files are normalized on import — see the literate route's
 * import handler), so this parser is deliberately simpler than Agda's own
 * literate-Markdown reader (references/agda/src/full/Agda/Syntax/Parser/
 * Literate.hs): only the exact ` ```agda ` / ` ``` ` fence convention this
 * app itself emits is recognized, anchored at line start.
 *
 * Block ranges include their own fence lines (the ` ```agda `/` ``` ` lines
 * belong to the code block they delimit), so deleting "this block" removes
 * the fences too, matching the natural mental model.
 */

const FENCE_OPEN = /^```agda\s*$/
const FENCE_CLOSE = /^```\s*$/

/**
 * @typedef LiterateBlock
 * @prop {'markdown' | 'code'} type
 * @prop {number} from
 * @prop {number} to
 */

/**
 * @param {string} text
 * @returns {LiterateBlock[]}
 */
export function parseLiterateBlocks(text) {
  /** @type {LiterateBlock[]} */
  const blocks = []
  const lines = text.split('\n')

  let pos = 0
  let blockStart = 0
  let inCode = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineStart = pos
    const lineEnd = pos + line.length
    const nextPos = i < lines.length - 1 ? lineEnd + 1 : lineEnd

    if (!inCode && FENCE_OPEN.test(line)) {
      if (lineStart > blockStart) blocks.push({ type: 'markdown', from: blockStart, to: lineStart })
      blockStart = lineStart
      inCode = true
    } else if (inCode && FENCE_CLOSE.test(line)) {
      blocks.push({ type: 'code', from: blockStart, to: nextPos })
      blockStart = nextPos
      inCode = false
    }

    pos = nextPos
  }

  // A code block left open at EOF (e.g. mid-edit, closing fence momentarily
  // deleted) still counts as code, matching what Agda's own reader would do.
  if (blockStart < text.length) {
    blocks.push({ type: inCode ? 'code' : 'markdown', from: blockStart, to: text.length })
  }

  return blocks
}

/**
 * @param {LiterateBlock[]} blocks
 * @param {number} pos
 * @returns {number} index into blocks; the last block if pos is at/past EOF
 */
export function blockIndexAtPos(blocks, pos) {
  for (let i = 0; i < blocks.length; i++) {
    if (pos < blocks[i].to) return i
  }
  return blocks.length - 1
}

/**
 * Pure prefix truncation — never touches anything before blocks[blockIndex].to.
 * @param {string} text
 * @param {LiterateBlock[]} blocks
 * @param {number} blockIndex
 * @returns {string}
 */
export function truncateToBlock(text, blocks, blockIndex) {
  return text.slice(0, blocks[blockIndex]?.to ?? text.length)
}

/** @returns {string} */
export function newMarkdownBlockText() {
  return '\n\n_new block_\n\n'
}

/** @returns {string} */
export function newCodeBlockText() {
  return '\n\n```agda\n\n```\n\n'
}
