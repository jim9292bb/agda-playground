import { StateField } from '@codemirror/state'
import { EditorView, Decoration, WidgetType } from '@codemirror/view'
import { marked } from 'marked'
import { literateBlocksField } from './literate-blocks-state'
import { blockIndexAtPos } from '$lib/agda/literate-blocks'

/** @import { LiterateBlock } from '$lib/agda/literate-blocks' */

class MarkdownPreviewWidget extends WidgetType {
  /**
   * @param {string} text
   * @param {number} from position to place the cursor at on click -- a
   *   Decoration.replace({block: true}) widget is a single atomic unit from
   *   CodeMirror's own click-to-position mapping's point of view (confirmed
   *   empirically: clicking anywhere inside one resolves to a position
   *   *outside* the replaced range, not partway through it), so entering
   *   edit mode needs an explicit handler rather than relying on default
   *   click behavior.
   */
  constructor(text, from) {
    super()
    this.text = text
    this.from = from
  }

  /** @param {WidgetType} other */
  eq(other) {
    return other instanceof MarkdownPreviewWidget && other.text === this.text && other.from === this.from
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const div = document.createElement('div')
    div.className = 'cm-markdown-preview'
    // Rendering the user's own local document, not third-party/untrusted
    // content -- no server, no other users. See markdown-preview.js's
    // module doc for the accepted trade-off of skipping HTML sanitization.
    div.innerHTML = /** @type {string} */ (marked.parse(this.text, { async: false }))
    div.addEventListener('mousedown', event => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true })
      view.focus()
    })
    return div
  }

  ignoreEvent() {
    // This widget handles its own click-to-edit above; don't let
    // CodeMirror's default pointer handling additionally process it.
    return true
  }
}

/** @param {import('@codemirror/state').EditorState} state */
function buildDecorations(state) {
  const blocks = state.field(literateBlocksField)
  const selection = state.selection.main
  // Reuses blockIndexAtPos's own boundary convention (a position exactly at
  // a block's start belongs to that block) so this agrees with every other
  // "which block is the cursor in" computation in the app (literatePresync,
  // performLoad) rather than using an independent, inconsistent check.
  const currentBlockIndex = blockIndexAtPos(blocks, selection.head)

  /** @type {import('@codemirror/state').Range<Decoration>[]} */
  const decorations = []
  blocks.forEach((block, index) => {
    if (block.type !== 'markdown') return
    if (block.from === block.to) return
    // Leave the block the cursor is currently in (or any block a non-empty
    // selection overlaps) as plain editable text.
    if (index === currentBlockIndex) return
    if (selection.from < block.to && selection.to > block.from) return

    const text = state.doc.sliceString(block.from, block.to)
    if (!text.trim()) return

    decorations.push(
      Decoration.replace({ widget: new MarkdownPreviewWidget(text, block.from), block: true }).range(block.from, block.to)
    )
  })
  return Decoration.set(decorations, true)
}

const markdownPreviewField = StateField.define({
  create(state) {
    return buildDecorations(state)
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value
    return buildDecorations(tr.state)
  },
  provide: field => EditorView.decorations.from(field),
})

// Widget DOM is created imperatively by CodeMirror, outside Svelte's
// template tree, so it never receives Svelte's scoped-style attribute --
// styled here via EditorView.baseTheme() instead, the same mechanism the
// rest of this app's CodeMirror-specific styling already uses.
const markdownPreviewTheme = EditorView.baseTheme({
  '.cm-markdown-preview': {
    padding: '4px 8px',
    cursor: 'text',
    // literate-block-borders.js gives editable (code, or the actively-
    // edited markdown) blocks a bordered-box look via per-line decorations;
    // a collapsed markdown-preview widget has no visible lines for that to
    // attach to (it IS the replacement), so it gets equivalent border/
    // background/radius styling directly here instead -- matching color,
    // never a "focused" variant, since a block only ever renders as this
    // widget when it does NOT contain the cursor (see buildDecorations).
    border: '2px solid rgba(100,110,255,0.3)',
    borderRadius: '6px',
    backgroundColor: 'rgba(100,110,255,0.045)',
    margin: '4px 0',
  },
  '.cm-markdown-preview h1, .cm-markdown-preview h2, .cm-markdown-preview h3': {
    margin: '0.4em 0',
  },
  '.cm-markdown-preview p': {
    margin: '0.4em 0',
  },
  '.cm-markdown-preview code': {
    fontFamily: 'JuliaMono, monospace',
    background: 'rgba(128,128,128,0.15)',
    padding: '0 3px',
    borderRadius: '2px',
  },
})

/** @returns {import('@codemirror/state').Extension} */
export function literateMarkdownPreview() {
  return [literateBlocksField, markdownPreviewField, markdownPreviewTheme]
}
