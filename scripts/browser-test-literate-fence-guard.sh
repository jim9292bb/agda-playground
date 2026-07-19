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

ab eval "(() => {
  const gutters = document.querySelector('.cm-gutters')
  if (gutters && getComputedStyle(gutters).display !== 'none') throw new Error('Expected .cm-gutters to be hidden')
  return { ok: true }
})()"
echo "PASS line-number gutter is hidden"

# Ordinary typing (not touching any fence line) must still work.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  const pos = doc.indexOf('open import')
  const before = doc.length
  view.dispatch({ changes: { from: pos, to: pos, insert: 'X' } })
  const after = view.state.doc.toString()
  if (after.length !== before + 1) throw new Error('Ordinary typing was unexpectedly blocked')
  return { ok: true }
})()"
echo "PASS ordinary content edits are not blocked"

# Manually typing a new fence line must be blocked.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  const pos = doc.indexOf('# Agda')
  const before = doc.length
  const fence = String.fromCharCode(96, 96, 96) + 'agda\n'
  view.dispatch({ changes: { from: pos, to: pos, insert: fence } })
  const after = document.querySelector('.cm-content')?.cmTile?.view?.state.doc.toString() ?? ''
  if (after.length !== before) throw new Error('Manually typing a new fence line was not blocked')
  return { ok: true }
})()"
echo "PASS manually typing a new fence line is blocked"

# Editing/deleting characters within an *existing* fence line must be blocked.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const lines = view.state.doc.toString().split('\n')
  const fenceLineNumber = lines.findIndex(l => l === '\`\`\`agda') + 1
  if (fenceLineNumber < 1) throw new Error('Could not find the real \`\`\`agda fence line')
  const fenceLine = view.state.doc.line(fenceLineNumber)
  const before = view.state.doc.length
  view.dispatch({ changes: { from: fenceLine.from, to: fenceLine.from + 1, insert: '' } })
  const after = document.querySelector('.cm-content')?.cmTile?.view?.state.doc.length ?? -1
  if (after !== before) throw new Error('Editing an existing fence line was not blocked')
  return { ok: true }
})()"
echo "PASS editing an existing fence line is blocked"

# The toolbar buttons (which carry the sanctioned bypass annotation) must
# still work despite the guard.
ab eval "(() => {
  const before = document.querySelector('.cm-content')?.cmTile?.view?.state.doc.length
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ Code')
  if (!btn) throw new Error('+ Code button not found')
  btn.click()
  const after = document.querySelector('.cm-content')?.cmTile?.view?.state.doc.length
  if (!(after > before)) throw new Error('+ Code button was blocked by the fence guard')
  return { ok: true }
})()"
echo "PASS the + Code toolbar button still works (bypasses the guard)"

ab eval "(() => {
  const before = document.querySelector('.cm-content')?.cmTile?.view?.state.doc.length
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delete block')
  if (!btn) throw new Error('Delete block button not found')
  btn.click()
  const after = document.querySelector('.cm-content')?.cmTile?.view?.state.doc.length
  if (!(after < before)) throw new Error('Delete block button was blocked by the fence guard')
  return { ok: true }
})()"
echo "PASS the Delete block toolbar button still works (bypasses the guard)"

# Give/Refine/Auto (programmatic, non-toolbar edits to goal content, which
# never touch fence lines) must be unaffected by the guard.
set_editor_fixture "test-fixtures/agda/idN-auto.lagda.md" "{! !}" 3
press_agda_chord "l" "KeyL"
wait_for_log_contains "Load finished." 30000
cursor_in_goal 0
press_agda_chord "a" "KeyA"
ab wait 5000
assert_editor_contains "idN n = n" "Auto still fills a goal correctly with the fence guard active"

echo "browser-test-literate-fence-guard: PASS"
