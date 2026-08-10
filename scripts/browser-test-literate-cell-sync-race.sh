#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regression test for the cell<->hidden-view offset staleness bug fixed in
# cellSyncExtensions' updateListener (src/routes/literate/+page.svelte):
# `cells[idx].text` used to be written *after* dispatching the local edit to
# `hiddenView`, but EditorView.dispatch() re-enters
# hiddenViewUpdateListener synchronously before returning -- so that
# listener's own computeCellContentOffsets(cells) call read the pre-edit
# cell content for one pass, computing a goal/highlight projection window
# shifted by the edit's length for the edited cell and every cell after it.
# That shift could land a decoration exactly on a window boundary (zero
# width) or break RangeSet.of's sort assumption on overlapping decorations,
# throwing inside the updateListener -- an exception CodeMirror swallows
# silently, dropping that whole projection pass with no visible error.
#
# This reproduces the failure mode directly: two code cells, an active
# goal in cell 1, then a *single* edit to the unrelated cell 0. Confirmed
# empirically (by temporarily reverting the fix) that this alone was
# enough to make cell 1's `.agda-hole` goal decoration disappear entirely
# with zero console output -- editing cell 0 shifts the assembled
# document's cell-1 boundary by one character, but the buggy code read
# `cells[0].text` (used to compute that boundary) one updateListener pass
# too early, before it had been updated to the post-edit length; the
# resulting off-by-one projection window either clipped the goal mark to
# zero width or hit RangeSetBuilder's sort assumption, both of which throw
# inside `EditorView.updateListener` -- a call site CodeMirror wraps in its
# own try/catch, so the exception (and the whole projection dispatch) is
# dropped with no visible error, per projectRangeSetToWindow's own comments
# in literate-cell-sync.js.

literate_open_app
start_als

click_toolbar_button "+ Code"
assert_cell_count 3 "default markdown+code, plus a freshly inserted second code cell"

set_cell_content 1 "foo : Set
foo = ?"

press_agda_chord_in_cell 1 "l" "KeyL"
wait_for_log_contains "Load finished." 30000
assert_cell_contains 1 "foo = {!" "Load creates a goal inside the second code cell"

ab console --clear >/dev/null

ab eval "(() => {
  const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
  const v0 = cells[0].cmTile.view
  v0.dispatch({ changes: { from: v0.state.doc.length, insert: 'Z' } })
  return { ok: true, doc0: v0.state.doc.toString() }
})()"
echo "PASS single edit to the unrelated cell 0 completed without throwing"

console_errors="$(ab console --json | node -e '
  let raw = ""
  process.stdin.on("data", d => raw += d)
  process.stdin.on("end", () => {
    const { data } = JSON.parse(raw)
    const errors = (data.messages || []).filter(m => m.type === "error")
    process.stdout.write(JSON.stringify(errors))
  })
')"
if [[ "$console_errors" != "[]" ]]; then
  echo "Console errors were logged after editing cell 0 (a swallowed exception would surface here):" >&2
  echo "$console_errors" >&2
  exit 1
fi
echo "PASS no console errors after editing the unrelated cell"

assert_cell_contains 1 "foo = {!" "the goal placeholder text in cell 1 is untouched by the edit to cell 0"

ab eval "(() => {
  const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
  const holes = cells[1].querySelectorAll('.agda-hole')
  if (holes.length !== 1) throw new Error('expected exactly one .agda-hole in cell 1, found ' + holes.length + ' -- the goal projection was dropped')
  if (!holes[0].textContent.includes('{!')) throw new Error('goal decoration text looks wrong: ' + holes[0].textContent)
  return { ok: true, text: holes[0].textContent }
})()"
echo "PASS goal decoration in cell 1 survived the edit to the unrelated cell 0"

echo "browser-test-literate-cell-sync-race: PASS"
