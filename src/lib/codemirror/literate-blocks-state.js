import { StateField } from '@codemirror/state'
import { parseLiterateBlocks } from '$lib/agda/literate-blocks'

/** @import { LiterateBlock } from '$lib/agda/literate-blocks' */

/**
 * Tracks the current document's literate block structure, recomputed
 * whenever the document changes. Consumed by markdown-preview.js (which
 * blocks to render) and the route's presync/toolbar logic (which block the
 * cursor is in).
 * @type {import('@codemirror/state').StateField<LiterateBlock[]>}
 */
export const literateBlocksField = StateField.define({
  create(state) {
    return parseLiterateBlocks(state.doc.toString())
  },
  update(value, tr) {
    if (!tr.docChanged) return value
    return parseLiterateBlocks(tr.state.doc.toString())
  },
})
