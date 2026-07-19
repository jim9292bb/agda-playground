#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Must be set before sourcing browser-common.sh (see browser-test-literate-basic.sh).
APP_URL="${APP_URL:-http://127.0.0.1:8099/literate}"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
ab eval "localStorage.removeItem('agda-playground-literate.shortcut-overrides.v1'); localStorage.removeItem('agda-web-ide-beta:doc:source.lagda.md'); location.reload()"
ab wait --load networkidle

start_als

# The default document opens with the cursor at position 0, inside its own
# leading markdown block -- that block must stay as plain editable text
# until the cursor actually leaves it.
ab eval "(() => {
  const count = document.querySelectorAll('.cm-markdown-preview').length
  if (count !== 0) throw new Error('Expected the block containing the cursor to stay unrendered, found ' + count + ' preview widget(s)')
  return { ok: true }
})()"
echo "PASS leading markdown block containing the cursor is not rendered as a preview"

# Move the cursor into the code block -- the leading markdown block should
# now render as a preview widget.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  const pos = doc.indexOf('OPTIONS')
  view.dispatch({ selection: { anchor: pos } })
  return { ok: true, pos }
})()"

ab eval "(() => {
  const widget = document.querySelector('.cm-markdown-preview')
  if (!widget) throw new Error('Expected a markdown preview widget once the cursor left the block')
  if (!widget.querySelector('h1')) throw new Error('Expected the rendered heading: ' + widget.innerHTML)
  return { ok: true, html: widget.innerHTML }
})()"
echo "PASS markdown block renders as HTML once the cursor leaves it"

# Clicking inside the rendered preview must place the cursor at the start of
# that block and turn it back into editable text -- Decoration.replace with
# block: true is an atomic unit for CodeMirror's own click-to-position
# mapping (clicking inside it does NOT resolve to a position partway
# through), so this depends on markdown-preview.js's own mousedown handler,
# not CodeMirror's default behavior.
ab eval "(() => {
  const p = document.querySelector('.cm-markdown-preview p') ?? document.querySelector('.cm-markdown-preview')
  const rect = p.getBoundingClientRect()
  const x = rect.left + 10
  const y = rect.top + 10
  const el = document.elementFromPoint(x, y)
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
  return { ok: true }
})()"

ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const widgets = document.querySelectorAll('.cm-markdown-preview').length
  const editor = document.querySelector('.cm-content')
  if (widgets !== 0) throw new Error('Expected the clicked block to become editable (no widgets), found ' + widgets)
  if (view.state.selection.main.head !== 0) throw new Error('Expected the cursor at the start of the block, got ' + view.state.selection.main.head)
  if (!editor.contains(document.activeElement)) throw new Error('Editor is not focused after clicking into the preview')
  return { ok: true, cursor: view.state.selection.main.head }
})()"
echo "PASS clicking inside the rendered preview makes the block editable again and places the cursor at its start"

echo "browser-test-literate-preview: PASS"
