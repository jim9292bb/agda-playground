import { StateField, RangeSetBuilder } from '@codemirror/state'
import { EditorView, Decoration } from '@codemirror/view'
import { literateBlocksField } from './literate-blocks-state'
import { blockIndexAtPos } from '$lib/agda/literate-blocks'

/**
 * Cell-like borders for both markdown and code blocks, with the block the
 * cursor is currently in getting a distinct "focused" border color (like
 * Jupyter's active-cell highlight). Implemented as per-line Decoration.line
 * classes: CodeMirror has no single wrapping DOM element per block (unlike
 * Jupyter, where each cell is its own separate editor instance with its own
 * container div), so the box shape is built from border-left/right on every
 * line in the block plus border-top/bottom (with matching corner radius)
 * only on the block's first/last line.
 *
 * Only covers *visible* lines -- a markdown block collapsed into
 * markdown-preview.js's widget has no rendered lines to decorate this way;
 * that widget gets equivalent border/background/focus styling directly on
 * its own DOM in markdown-preview.js instead.
 *
 * @param {import('@codemirror/state').EditorState} state
 */
function buildLineDecorations(state) {
  const blocks = state.field(literateBlocksField)
  const focusedIndex = blockIndexAtPos(blocks, state.selection.main.head)

  /** @type {RangeSetBuilder<Decoration>} */
  const builder = new RangeSetBuilder()
  blocks.forEach((block, index) => {
    if (block.from === block.to) return
    const startLine = state.doc.lineAt(block.from).number
    const endLine = state.doc.lineAt(Math.max(block.from, block.to - 1)).number

    for (let ln = startLine; ln <= endLine; ln++) {
      const classes = [`cm-literate-block`, `cm-literate-block-${block.type}`]
      if (ln === startLine) classes.push('cm-literate-block-first')
      if (ln === endLine) classes.push('cm-literate-block-last')
      if (index === focusedIndex) classes.push('cm-literate-block-focused')
      builder.add(state.doc.line(ln).from, state.doc.line(ln).from, Decoration.line({ class: classes.join(' ') }))
    }
  })
  return builder.finish()
}

const literateBlockBordersField = StateField.define({
  create(state) {
    return buildLineDecorations(state)
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value
    return buildLineDecorations(tr.state)
  },
  provide: field => EditorView.decorations.from(field),
})

const literateBlockBordersTheme = EditorView.baseTheme({
  '.cm-literate-block': {
    borderLeftWidth: '2px',
    borderRightWidth: '2px',
    borderLeftStyle: 'solid',
    borderRightStyle: 'solid',
    borderTopWidth: '0',
    borderBottomWidth: '0',
    borderTopStyle: 'solid',
    borderBottomStyle: 'solid',
    paddingLeft: '6px',
  },
  '.cm-literate-block-first': {
    borderTopWidth: '2px',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    marginTop: '4px',
    paddingTop: '2px',
  },
  '.cm-literate-block-last': {
    borderBottomWidth: '2px',
    borderBottomLeftRadius: '6px',
    borderBottomRightRadius: '6px',
    marginBottom: '4px',
    paddingBottom: '2px',
  },
  '.cm-literate-block-markdown': {
    borderColor: 'rgba(100,110,255,0.3)',
    backgroundColor: 'rgba(100,110,255,0.045)',
  },
  '.cm-literate-block-code': {
    borderColor: 'rgba(70,170,110,0.35)',
    backgroundColor: 'rgba(70,170,110,0.05)',
  },
  '.cm-literate-block-focused': {
    borderColor: 'var(--quiet-primary-stroke, #3b3aab)',
  },
})

/** @returns {import('@codemirror/state').Extension} */
export function literateBlockBorders() {
  return [literateBlocksField, literateBlockBordersField, literateBlockBordersTheme]
}
