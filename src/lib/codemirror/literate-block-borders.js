import { StateField, RangeSetBuilder } from '@codemirror/state'
import { EditorView, Decoration, WidgetType } from '@codemirror/view'
import { literateBlocksField } from './literate-blocks-state'
import { editingMarkdownBlockField } from './markdown-preview'
import { isFenceLine } from '$lib/agda/literate-blocks'

/**
 * GitHub-README-like styling for code blocks (bordered, light gray
 * background) and markdown blocks (borderless, blends into the page --
 * markdown-preview.js's rendered widget carries its own white background;
 * this module only needs to style the *editable raw text* while a markdown
 * block is being edited, and gives it a light "active" border so its extent
 * is still visible while typing). Implemented as per-line Decoration.line
 * classes: CodeMirror has no single wrapping DOM element per block (unlike
 * Jupyter, where each cell is its own separate editor instance with its own
 * container div), so the box shape is built from border-left/right on every
 * *visible* line in the block, with corner rounding applied via a CSS
 * sibling selector (see the theme below) rather than a "first/last line"
 * class computed here -- a Decoration.line() class placed exactly at the
 * position where a preceding block-level replace decoration ends was
 * confirmed (empirically) to sometimes silently fail to render, so corner
 * placement is derived from genuine DOM adjacency instead of a
 * position-based class lookup that has to survive that same boundary.
 *
 * Code blocks never visually show their ` ```agda `/` ``` ` fence lines --
 * those lines are hidden with a zero-content `Decoration.replace({block:
 * true})`, rendered via a tiny marker widget (never by touching the
 * document) so the corner-radius CSS below has a real sibling element to
 * key off of.
 */

class FenceMarkerWidget extends WidgetType {
  /** @param {WidgetType} other */
  eq(other) {
    return other instanceof FenceMarkerWidget
  }
  toDOM() {
    const div = document.createElement('div')
    div.className = 'cm-literate-fence-line'
    return div
  }
  ignoreEvent() {
    return true
  }
}

/** @param {import('@codemirror/state').EditorState} state */
function buildLineDecorations(state) {
  const blocks = state.field(literateBlocksField)
  const editingFrom = state.field(editingMarkdownBlockField)

  /** @type {import('@codemirror/state').Range<Decoration>[]} */
  const fenceDecorations = []
  /** @type {RangeSetBuilder<Decoration>} */
  const builder = new RangeSetBuilder()
  blocks.forEach((/** @type {import('$lib/agda/literate-blocks').LiterateBlock} */ block) => {
    if (block.from === block.to) return
    const startLine = state.doc.lineAt(block.from).number
    const endLine = state.doc.lineAt(Math.max(block.from, block.to - 1)).number

    // A markdown block only gets a border while it is the one actively
    // being edited -- so its raw-text extent stays visible while typing --
    // never while merely rendered (that state has no visible lines at all)
    // and never for any other markdown block.
    const isEditingMarkdown = block.type === 'markdown' && block.from === editingFrom

    for (let ln = startLine; ln <= endLine; ln++) {
      const line = state.doc.line(ln)
      if (block.type === 'code' && isFenceLine(line.text)) {
        const to = ln < state.doc.lines ? state.doc.line(ln + 1).from : line.to
        fenceDecorations.push(Decoration.replace({ widget: new FenceMarkerWidget(), block: true }).range(line.from, to))
        continue
      }
      if (block.type !== 'code' && !isEditingMarkdown) continue

      const cls = block.type === 'code' ? 'cm-literate-block cm-literate-block-code' : 'cm-literate-block cm-literate-block-markdown-editing'
      builder.add(line.from, line.from, Decoration.line({ class: cls }))
    }
  })
  const lineDecorations = builder.finish()
  return fenceDecorations.length ? lineDecorations.update({ add: fenceDecorations, sort: true }) : lineDecorations
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
  '.cm-literate-fence-line': {
    height: '0',
  },
  '.cm-literate-block': {
    borderLeftWidth: '2px',
    borderRightWidth: '2px',
    borderLeftStyle: 'solid',
    borderRightStyle: 'solid',
    paddingLeft: '6px',
  },
  '.cm-literate-block-code': {
    borderColor: 'rgba(0,0,0,0.15)',
    backgroundColor: '#f6f8fa',
  },
  '.cm-literate-block-markdown-editing': {
    borderColor: 'rgba(70,110,255,0.35)',
    borderStyle: 'dashed',
  },
  // Corner rounding + margin, applied via real DOM adjacency to the (always
  // rendered, even though visually zero-height) fence marker widgets rather
  // than a position-computed "first/last line" class.
  '.cm-literate-fence-line + .cm-literate-block': {
    borderTopWidth: '2px',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    marginTop: '14px',
    paddingTop: '6px',
  },
  '.cm-literate-block:has(+ .cm-literate-fence-line)': {
    borderBottomWidth: '2px',
    borderBottomLeftRadius: '6px',
    borderBottomRightRadius: '6px',
    marginBottom: '14px',
    paddingBottom: '6px',
  },
  '.cm-literate-block:last-child': {
    borderBottomWidth: '2px',
    borderBottomLeftRadius: '6px',
    borderBottomRightRadius: '6px',
    marginBottom: '14px',
    paddingBottom: '6px',
  },
})

/** @returns {import('@codemirror/state').Extension} */
export function literateBlockBorders() {
  return [
    literateBlocksField,
    editingMarkdownBlockField,
    literateBlockBordersField,
    // Fence lines are hidden via a zero-content block replace (see
    // buildLineDecorations above) -- registering them as atomic keeps
    // keyboard cursor motion from ever stopping inside that collapsed
    // range, consistent with markdown-preview.js's own atomicRanges.
    EditorView.atomicRanges.of(view => view.state.field(literateBlockBordersField)),
    literateBlockBordersTheme,
  ]
}
