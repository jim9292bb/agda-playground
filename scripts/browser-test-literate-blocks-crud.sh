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

# Start from a known, single-code-block document so block counts are predictable.
set_editor_fixture "test-fixtures/agda/idN-auto.lagda.md" "data N" 0
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  return { ok: true }
})()"

ab eval "(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delete block')
  if (!btn) throw new Error('Delete block button not found')
  if (btn.disabled) throw new Error('Delete block should be enabled with more than one block')
  return { ok: true, disabled: btn.disabled }
})()"
echo "PASS Delete block is enabled when the document has more than one block"

# + Markdown: inserts a new markdown block right after the current one, with
# the placeholder text selected for immediate overwrite.
ab eval "(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ Markdown')
  if (!btn) throw new Error('+ Markdown button not found')
  btn.click()
  return { ok: true }
})()"
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  if (!doc.includes('_new block_')) throw new Error('Expected the placeholder text to be inserted: ' + doc)
  const sel = view.state.selection.main
  const selected = doc.slice(sel.from, sel.to)
  if (selected !== '_new block_') throw new Error('Expected the placeholder text to be selected, got: ' + JSON.stringify(selected))
  return { ok: true }
})()"
echo "PASS + Markdown inserts a new block with its placeholder text selected"

# Typing now should replace the selected placeholder.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const sel = view.state.selection.main
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: 'hello' }, selection: { anchor: sel.from + 'hello'.length } })
  return { ok: true }
})()"
assert_editor_contains "hello" "Typing after inserting a markdown block replaces the selected placeholder"

# + Code: inserts a new fenced code block, cursor on the blank interior line.
ab eval "(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ Code')
  if (!btn) throw new Error('+ Code button not found')
  btn.click()
  return { ok: true }
})()"
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  const sel = view.state.selection.main
  if (sel.from !== sel.to) throw new Error('Expected a plain cursor (no selection) after inserting a code block')
  const before = doc.slice(0, sel.from)
  const after = doc.slice(sel.from)
  if (!before.endsWith('\`\`\`agda\n')) throw new Error('Cursor is not right after the opening fence: ' + JSON.stringify(before.slice(-20)))
  if (!after.startsWith('\n\`\`\`')) throw new Error('Cursor is not right before the closing fence: ' + JSON.stringify(after.slice(0, 20)))
  return { ok: true }
})()"
echo "PASS + Code inserts a new fenced block with the cursor on its blank interior line"

# Delete block: removes the block the cursor is in. Note 'idN' alone is
# ambiguous (the fixture's own intro prose mentions `idN` too) -- use a
# marker that only appears inside the code block itself.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  const pos = doc.indexOf('idN n =')
  if (pos < 0) throw new Error('Marker not found in current doc: ' + doc)
  view.dispatch({ selection: { anchor: pos } })
  return { ok: true, pos }
})()"
ab eval "(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delete block')
  btn.click()
  return { ok: true }
})()"
ab eval "(() => {
  const doc = document.querySelector('.cm-content')?.cmTile?.view?.state.doc.toString() ?? ''
  if (doc.includes('idN n =')) throw new Error('Expected the idN code block to be gone: ' + doc)
  if (!doc.includes('hello')) throw new Error('Expected the other blocks to survive: ' + doc)
  return { ok: true, doc }
})()"
echo "PASS Delete block removes exactly the block the cursor is in, leaving the others intact"

# Delete down to a single block and confirm the button becomes disabled.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const clickDeleteAt = (marker) => {
    const doc = view.state.doc.toString()
    const pos = doc.indexOf(marker)
    if (pos < 0) return false
    view.dispatch({ selection: { anchor: pos } })
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delete block')
    if (btn.disabled) return false
    btn.click()
    return true
  }
  clickDeleteAt('hello')
  clickDeleteAt('\`\`\`agda')
  return { ok: true, remaining: view.state.doc.toString() }
})()"
ab eval "(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delete block')
  if (!btn.disabled) throw new Error('Expected Delete block to be disabled with only one block left')
  return { ok: true }
})()"
echo "PASS Delete block is disabled once only one block remains"

echo "browser-test-literate-blocks-crud: PASS"
