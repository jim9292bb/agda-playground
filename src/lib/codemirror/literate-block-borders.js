import { StateField } from '@codemirror/state'
import { EditorView, Decoration, ViewPlugin } from '@codemirror/view'
import { literateBlocksField } from './literate-blocks-state'
import { editingMarkdownBlockField } from './markdown-preview'
import { isFenceLine } from '$lib/agda/literate-blocks'

/**
 * GitHub-README-like styling for code blocks (bordered, light gray
 * background) and markdown blocks (borderless, blends into the page --
 * markdown-preview.js's rendered widget carries its own white background;
 * this module only needs to style the *editable raw text* while a markdown
 * block is being edited, and gives it a light "active" border so its extent
 * is still visible while typing).
 *
 * This is applied by directly patching `.cm-line` DOM elements' `className`
 * after every render, not via CodeMirror's Decoration.line() API. That was
 * tried first and confirmed (empirically, via real browser renders) to be
 * unreliable: a Decoration.line() class placed on the line immediately
 * *after* any block-level widget/replace decoration -- e.g. a code block's
 * first content line, right after the hidden opening fence, or the fence
 * itself, right after a rendered markdown-preview widget -- silently fails
 * to attach, regardless of which StateField owns the widget or the line
 * decoration. Patching class names directly on the already-rendered DOM
 * sidesteps that quirk entirely, since it runs after CodeMirror has
 * finished building the view.
 *
 * @param {import('@codemirror/state').EditorState} state
 */

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @returns {HTMLElement | null}
 */
function lineDomAt(view, pos) {
  let node = view.domAtPos(pos).node
  while (node && node.nodeType === 3) node = /** @type {Node} */ (node.parentNode)
  let el = /** @type {HTMLElement | null} */ (node)
  while (el && !el.classList.contains('cm-line')) el = el.parentElement
  return el
}

/** @param {import('@codemirror/view').EditorView} view */
function applyLineClasses(view) {
  const state = view.state
  const blocks = state.field(literateBlocksField)
  const editingFrom = state.field(editingMarkdownBlockField)

  view.dom.querySelectorAll('.cm-line.cm-literate-block, .cm-line.cm-literate-fence-line').forEach(el => {
    el.className = 'cm-line'
  })

  blocks.forEach((/** @type {import('$lib/agda/literate-blocks').LiterateBlock} */ block) => {
    if (block.from === block.to) return
    const startLine = state.doc.lineAt(block.from).number
    const endLine = state.doc.lineAt(Math.max(block.from, block.to - 1)).number

    /** @type {number[]} */
    const lineNumbers = []
    for (let ln = startLine; ln <= endLine; ln++) lineNumbers.push(ln)

    const fenceLineNumbers =
      block.type === 'code' ? new Set(lineNumbers.filter(ln => isFenceLine(state.doc.line(ln).text))) : new Set()
    const visibleLineNumbers = lineNumbers.filter(ln => !fenceLineNumbers.has(ln))
    const isEditingMarkdown = block.type === 'markdown' && block.from === editingFrom

    for (const ln of lineNumbers) {
      const line = state.doc.line(ln)
      const dom = lineDomAt(view, line.from)
      if (!dom) continue

      if (fenceLineNumbers.has(ln)) {
        dom.className = 'cm-line cm-literate-fence-line'
        continue
      }
      if (block.type !== 'code' && !isEditingMarkdown) continue

      const classes = ['cm-line', 'cm-literate-block', block.type === 'code' ? 'cm-literate-block-code' : 'cm-literate-block-markdown-editing']
      if (ln === visibleLineNumbers[0]) classes.push('cm-literate-block-first')
      if (ln === visibleLineNumbers[visibleLineNumbers.length - 1]) classes.push('cm-literate-block-last')
      dom.className = classes.join(' ')
    }
  })
}

const literateBlockStylePlugin = ViewPlugin.fromClass(
  class {
    /** @param {import('@codemirror/view').EditorView} view */
    constructor(view) {
      // view.domAtPos() isn't safe to call synchronously from a
      // ViewPlugin's constructor -- the view's internal content DOM isn't
      // fully built yet at that point (confirmed empirically: it throws
      // "Cannot read properties of undefined (reading 'domAtPos')" deep
      // inside CodeMirror's own domAtPos implementation). Defer the first
      // pass to a microtask, by which point the initial DOM is in place;
      // update() (called for every later transaction) is unaffected.
      queueMicrotask(() => applyLineClasses(view))
    }
    /** @param {import('@codemirror/view').ViewUpdate} update */
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
        applyLineClasses(update.view)
      }
    }
  }
)

/**
 * Non-visual atomic ranges spanning each (now DOM-patched, visually
 * collapsed) fence line, so keyboard cursor motion skips over them like any
 * other hidden content -- kept as a real Decoration/RangeSet (rather than
 * DOM patching) since EditorView.atomicRanges specifically wants one.
 * @param {import('@codemirror/state').EditorState} state
 */
function buildFenceAtomicRanges(state) {
  const blocks = state.field(literateBlocksField)
  /** @type {import('@codemirror/state').Range<Decoration>[]} */
  const ranges = []
  blocks.forEach((/** @type {import('$lib/agda/literate-blocks').LiterateBlock} */ block) => {
    if (block.type !== 'code' || block.from === block.to) return
    const startLine = state.doc.lineAt(block.from).number
    const endLine = state.doc.lineAt(Math.max(block.from, block.to - 1)).number
    for (let ln = startLine; ln <= endLine; ln++) {
      const line = state.doc.line(ln)
      if (isFenceLine(line.text) && line.to > line.from) ranges.push(Decoration.mark({}).range(line.from, line.to))
    }
  })
  return Decoration.set(ranges, true)
}

const literateFenceAtomicField = StateField.define({
  create(state) {
    return buildFenceAtomicRanges(state)
  },
  update(value, tr) {
    if (!tr.docChanged) return value
    return buildFenceAtomicRanges(tr.state)
  },
})

const literateBlockBordersTheme = EditorView.baseTheme({
  // Visually collapses to nothing -- height: 0 plus hidden overflow removes
  // both the text and the line's vertical space, while it stays a real DOM
  // line.
  '.cm-literate-fence-line': {
    height: '0',
    minHeight: '0',
    lineHeight: '0',
    fontSize: '0',
    padding: '0',
    margin: '0',
    overflow: 'hidden',
    border: 'none',
  },
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
    marginTop: '14px',
    paddingTop: '6px',
  },
  '.cm-literate-block-last': {
    borderBottomWidth: '2px',
    borderBottomLeftRadius: '6px',
    borderBottomRightRadius: '6px',
    marginBottom: '14px',
    paddingBottom: '6px',
  },
  '.cm-literate-block-code': {
    borderColor: 'rgba(0,0,0,0.15)',
    backgroundColor: '#f6f8fa',
  },
  '.cm-literate-block-markdown-editing': {
    borderColor: 'rgba(70,110,255,0.35)',
    borderStyle: 'dashed',
  },
})

/** @returns {import('@codemirror/state').Extension} */
export function literateBlockBorders() {
  return [
    literateBlocksField,
    editingMarkdownBlockField,
    literateBlockStylePlugin,
    literateFenceAtomicField,
    EditorView.atomicRanges.of(view => view.state.field(literateFenceAtomicField)),
    literateBlockBordersTheme,
  ]
}
