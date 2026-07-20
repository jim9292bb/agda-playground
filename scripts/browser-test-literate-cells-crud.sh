#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

literate_open_app

# --- Markdown cell rendering + edit mode ---------------------------------

# On load, the leading markdown cell renders immediately (no CodeMirror
# instance at all -- edit mode is explicit and button-driven, never derived
# from cursor position) with its own heading.
ab eval "(() => {
  const widget = document.querySelector('.literate-markdown-content')
  if (!widget) throw new Error('Expected the leading markdown cell to render on load')
  if (!widget.querySelector('h1')) throw new Error('Expected a rendered heading: ' + widget.innerHTML)
  return { ok: true }
})()"
echo "PASS leading markdown cell renders immediately on load"

assert_cell_count 2 "one markdown cell (rendered, no editor), one code cell"

ab eval "(() => {
  const btn = document.querySelector('.literate-markdown-edit-btn')
  if (!btn) throw new Error('Expected an Edit button on the rendered markdown cell')
  btn.click()
  return { ok: true }
})()"
ab eval "(() => {
  const rendered = document.querySelectorAll('.literate-markdown-content').length
  const doneBtn = !!document.querySelector('.literate-markdown-done-btn')
  if (rendered !== 0) throw new Error('Expected the markdown cell to become editable, found ' + rendered + ' rendered widget(s)')
  if (!doneBtn) throw new Error('Expected a Done button while editing')
  return { ok: true }
})()"
echo "PASS clicking Edit makes the markdown cell editable and shows a Done button"

ab eval "(() => {
  const btn = document.querySelector('.literate-markdown-done-btn')
  btn.click()
  return { ok: true }
})()"
ab eval "(() => {
  const rendered = document.querySelectorAll('.literate-markdown-content').length
  if (rendered !== 1) throw new Error('Expected the markdown cell to re-render after Done, found ' + rendered)
  return { ok: true }
})()"
echo "PASS clicking Done re-renders the markdown cell"

# --- Insert cells -----------------------------------------------------

# Explicitly focus the code cell so "+ Code" below inserts right after it,
# regardless of which cell was last active from the markdown edit/done
# round trip above.
ab eval "(() => {
  const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
  cells[0].cmTile.view.focus()
  return { ok: true }
})()"
click_toolbar_button "+ Code"
assert_cell_count 3 "+ Code inserted a third cell"
set_cell_content 1 "test : Set"
assert_cell_contains 1 "test : Set" "the newly inserted code cell is independently editable"

click_toolbar_button "+ Markdown"
assert_cell_count 4 "+ Markdown inserted a fourth cell"
ab eval "(() => {
  const doneBtn = !!document.querySelector('.literate-markdown-done-btn')
  if (!doneBtn) throw new Error('Expected the newly inserted markdown cell to auto-enter edit mode')
  return { ok: true }
})()"
echo "PASS + Markdown inserts a new cell that auto-enters edit mode"

echo "browser-test-literate-cells-crud: PASS"
