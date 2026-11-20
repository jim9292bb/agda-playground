#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Notebook counterpart of test:browser:command-input. /literate's
# command-input prompt differs from `/`'s in two places: the document
# version it snapshots comes from the hidden composite view (not any one
# cell's), and focus returns to the active cell's own EditorView.

literate_open_app
start_als

set_cell_content 0 "$(cat "$ROOT_DIR/test-fixtures/agda/plus-case-split.agda")"
press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 30000
assert_cell_contains 0 "a + b = {!   !}" "Load creates the goal in cell 0"

assert_cell_focused() {
  local index label
  index="$1"
  label="$2"
  ab eval "(() => {
    const el = document.querySelectorAll('.literate-cell-editor .cm-content')[Number($index)]
    if (!el) throw new Error('cell not found')
    if (!el.contains(document.activeElement)) throw new Error('Cell $index is not focused; active: ' + document.activeElement?.outerHTML?.slice(0, 80))
    return { ok: true }
  })()"
  echo "PASS cell $index focused: $label"
}

open_case_split_prompt() {
  run_agda_chord_at_cell_goal 0 0 "c" "KeyC"
  ab wait 1000 >/dev/null
  assert_command_prompt "Input for Case split"
}

# ── Opening the prompt ───────────────────────────────────────────────────────
open_case_split_prompt
assert_log_contains "Case split: enter command input in the Goals panel." "Case split opens command input panel"

# ── Empty input is rejected without closing the prompt ───────────────────────
submit_command_prompt "   "
ab wait 300 >/dev/null
ab eval "(() => {
  const error = document.querySelector('.command-input-error')
  if (!error?.textContent.includes('Enter an expression before submitting.')) throw new Error('Missing empty-input error: ' + error?.textContent)
  if (!document.querySelector('.command-input-panel')) throw new Error('Prompt closed on empty input')
  return { ok: true }
})()"
echo "PASS empty input shows an error and keeps the prompt open"

# ── Cancel ───────────────────────────────────────────────────────────────────
cancel_command_prompt
ab wait 500 >/dev/null
assert_no_command_prompt
assert_cell_focused 0 "after Cancel"
assert_log_contains "Case split cancelled." "Cancel does not send command"

# ── Editing the document while the prompt is open aborts the submit ─────────
open_case_split_prompt
ab eval "(() => {
  const view = document.querySelectorAll('.literate-cell-editor .cm-content')[0].cmTile.view
  view.dispatch({ changes: { from: view.state.doc.length, insert: '\n-- edited while prompt open\n' } })
  return { ok: true }
})()"
ab wait 300 >/dev/null
submit_command_prompt "a"
ab wait 1000 >/dev/null
assert_no_command_prompt
assert_log_contains "Case split failed: Reload or retry because the editor changed while the prompt was open." "stale prompt is rejected"
assert_cell_focused 0 "after stale submit"

# ── Successful submit ────────────────────────────────────────────────────────
press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 30000
open_case_split_prompt
submit_command_prompt "a"
ab wait 6000 >/dev/null
assert_no_command_prompt
assert_cell_focused 0 "after submit"
assert_cell_contains 0 "z + b = {!   !}" "Prompt submit case split zero clause"
assert_cell_contains 0 "s a + b = {!   !}" "Prompt submit case split successor clause"

echo "browser-test-literate-command-input: PASS"
