import { StateField, StateEffect } from '@codemirror/state'
import { EditorView, Decoration, WidgetType } from '@codemirror/view'
import { marked } from 'marked'
import { literateBlocksField } from './literate-blocks-state'

/** @import { LiterateBlock } from '$lib/agda/literate-blocks' */

/**
 * Dispatch this effect to enter edit mode for the markdown block starting at
 * the given document position, or to exit edit mode (value `null`). Edit
 * mode is now an explicit, button-driven state -- it is no longer derived
 * from cursor position, since a rendered block must only become editable
 * through its own "Edit" button (never by clicking the rendered text, and
 * never merely because the cursor passes through it).
 * @type {import('@codemirror/state').StateEffectType<number | null>}
 */
export const setEditingMarkdownBlock = StateEffect.define()

/**
 * Tracks the `from` position of the markdown block currently in edit mode
 * (or null). The position is re-mapped through document changes so typing
 * inside the block -- or edits earlier in the document that shift it --
 * don't lose track of it. Auto-exits (reverts to null) once the tracked
 * position no longer starts a markdown block (e.g. it was deleted), or once
 * the selection moves outside the block's own range -- covers both "click
 * elsewhere in the editor" and "arrow key past the boundary".
 */
export const editingMarkdownBlockField = StateField.define({
  create() {
    return /** @type {number | null} */ (null)
  },
  update(value, tr) {
    // An effect dispatched in *this* transaction already carries a position
    // valid in the resulting (post-change) document -- callers compute it
    // that way (e.g. the insert-block toolbar actions use the same offset
    // for both the change and the effect). Only a value carried over from
    // *before* this transaction needs to be re-mapped through its changes;
    // re-mapping a value this same transaction just set would shift it a
    // second time and land on the wrong block.
    let setThisTransaction = false
    for (const effect of tr.effects) {
      if (effect.is(setEditingMarkdownBlock)) {
        value = effect.value
        setThisTransaction = true
      }
    }
    if (value == null) return value
    if (!setThisTransaction && tr.docChanged) value = tr.changes.mapPos(value, -1)

    const blocks = tr.state.field(literateBlocksField)
    const block = blocks.find(b => b.type === 'markdown' && b.from === value)
    if (!block) return null

    const head = tr.state.selection.main.head
    if (head < block.from || head > block.to) return null

    return value
  },
})

class MarkdownPreviewWidget extends WidgetType {
  /**
   * @param {string} text
   * @param {number} from position of the block this widget replaces --
   *   passed to the Edit button below so it knows which block to switch
   *   into edit mode.
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
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-markdown-preview'

    const content = document.createElement('div')
    content.className = 'cm-markdown-preview-content'
    // Rendering the user's own local document, not third-party/untrusted
    // content -- no server, no other users. See markdown-preview.js's
    // module doc for the accepted trade-off of skipping HTML sanitization.
    content.innerHTML = /** @type {string} */ (marked.parse(this.text, { async: false }))
    wrapper.appendChild(content)

    const editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'cm-markdown-edit-button'
    editButton.textContent = 'Edit'
    editButton.setAttribute('aria-label', 'Edit this text block')
    editButton.addEventListener('mousedown', event => {
      event.preventDefault()
      event.stopPropagation()
      view.dispatch({
        effects: setEditingMarkdownBlock.of(this.from),
        selection: { anchor: this.from },
        scrollIntoView: true,
      })
      view.focus()
    })
    wrapper.appendChild(editButton)

    return wrapper
  }

  ignoreEvent() {
    // Entry is exclusively through the Edit button above; don't let
    // CodeMirror's default pointer handling additionally process clicks
    // elsewhere in the rendered content.
    return true
  }
}

class DoneEditingWidget extends WidgetType {
  /** @param {number} from position of the block currently being edited */
  constructor(from) {
    super()
    this.from = from
  }

  /** @param {WidgetType} other */
  eq(other) {
    return other instanceof DoneEditingWidget && other.from === this.from
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-markdown-done-editing'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-markdown-done-button'
    button.textContent = '✓ Done'
    button.setAttribute('aria-label', 'Finish editing this text block')
    button.addEventListener('mousedown', event => {
      event.preventDefault()
      event.stopPropagation()
      view.dispatch({ effects: setEditingMarkdownBlock.of(null) })
      view.focus()
    })
    wrapper.appendChild(button)

    return wrapper
  }

  ignoreEvent() {
    return true
  }
}

/** @param {import('@codemirror/state').EditorState} state */
function buildDecorations(state) {
  const blocks = state.field(literateBlocksField)
  const editingFrom = state.field(editingMarkdownBlockField)

  /** @type {import('@codemirror/state').Range<Decoration>[]} */
  const decorations = []
  blocks.forEach(block => {
    if (block.type !== 'markdown') return
    if (block.from === block.to) return

    if (block.from === editingFrom) {
      // Currently being edited: leave the raw text alone (don't replace
      // it), just append a non-replacing "Done" button widget right after
      // it so the block can be exited explicitly.
      decorations.push(
        // side: -1 anchors this to the *end of the editing block* rather
        // than the start of whatever immediately follows -- block.to
        // always exactly equals the next block's `from` (blocks partition
        // the document with no gaps), and a code block's own fence-hiding
        // replace decoration (literate-block-borders.js) starts at that
        // same position; side: 1 there was empirically swallowed by that
        // adjacent replacement and never rendered.
        Decoration.widget({ widget: new DoneEditingWidget(block.from), side: -1, block: true }).range(block.to)
      )
      return
    }

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
    if (!tr.docChanged && !tr.selection && !tr.effects.some(e => e.is(setEditingMarkdownBlock))) return value
    return buildDecorations(tr.state)
  },
  provide: field => EditorView.decorations.from(field),
})

/**
 * Exits edit mode when focus leaves the editor entirely (e.g. clicking a
 * toolbar button, or a panel elsewhere on the page) -- the
 * editingMarkdownBlockField's own update() already handles exits caused by
 * selection changes *within* the editor (clicking another block, arrow-key
 * navigation past the boundary).
 * @type {import('@codemirror/state').Extension}
 */
const exitEditingOnBlur = EditorView.domEventHandlers({
  blur(_event, view) {
    if (view.state.field(editingMarkdownBlockField) == null) return false
    view.dispatch({ effects: setEditingMarkdownBlock.of(null) })
    return false
  },
})

// Widget DOM is created imperatively by CodeMirror, outside Svelte's
// template tree, so it never receives Svelte's scoped-style attribute --
// styled here via EditorView.baseTheme() instead, the same mechanism the
// rest of this app's CodeMirror-specific styling already uses.
const markdownPreviewTheme = EditorView.baseTheme({
  '.cm-markdown-preview': {
    position: 'relative',
    padding: '4px 8px',
    margin: '14px 0',
    backgroundColor: '#ffffff',
  },
  '.cm-markdown-preview-content': {
    cursor: 'default',
  },
  '.cm-markdown-edit-button': {
    position: 'absolute',
    top: '2px',
    right: '4px',
    opacity: '0',
    transition: 'opacity 0.1s ease',
    fontSize: '0.8em',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#f6f8fa',
    cursor: 'pointer',
  },
  '.cm-markdown-preview:hover .cm-markdown-edit-button': {
    opacity: '1',
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
  '.cm-markdown-done-editing': {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '2px 8px',
  },
  '.cm-markdown-done-button': {
    fontSize: '0.8em',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(70,110,255,0.4)',
    background: 'rgba(70,110,255,0.08)',
    cursor: 'pointer',
  },
})

/** @returns {import('@codemirror/state').Extension} */
export function literateMarkdownPreview() {
  return [
    literateBlocksField,
    editingMarkdownBlockField,
    markdownPreviewField,
    // Registers the rendered markdown widgets as atomic ranges so
    // CodeMirror's own cursor-motion commands (arrow keys, Home/End, ...)
    // jump straight over a rendered block instead of ever landing a cursor
    // inside it -- entry is exclusively through the block's own Edit
    // button, never through keyboard navigation.
    EditorView.atomicRanges.of(view => view.state.field(markdownPreviewField)),
    exitEditingOnBlur,
    markdownPreviewTheme,
  ]
}
