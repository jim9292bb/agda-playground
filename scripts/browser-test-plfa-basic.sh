#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# Basic Load/Give/Case-split cycle against a real PLFA chapter (Naturals),
# not a hand-typed fixture -- /plfa's whole point is loading the book's own
# content with the rest of it mounted as a read-only library, so a synthetic
# fixture wouldn't exercise that. A throwaway goal is appended to the
# chapter's last cell (never written back to any file -- browser-only
# editor state) referencing `ℕ`/`zero`/`suc`, which the chapter itself
# already defines.

plfa_open_app
start_als

select_plfa_chapter "Naturals"
ab wait 500 >/dev/null

count="$(editor_cell_count)"
if [[ "$count" -lt 1 ]]; then
  echo "Expected at least one code cell in the Naturals chapter, found $count" >&2
  exit 1
fi
echo "PASS Naturals chapter loaded with $count code cells"

last_index=$((count - 1))

append_cell_content "$last_index" "

testGiveGoal : ℕ
testGiveGoal = {! !}

testCaseSplit : ℕ → ℕ
testCaseSplit n = {! n !}"

press_agda_chord_in_cell "$last_index" "l" "KeyL"
wait_for_log_contains "Load finished." 60000
assert_cell_contains "$last_index" "testGiveGoal = {!" "Load creates the first throwaway goal"
assert_cell_contains "$last_index" "testCaseSplit n = {!" "Load creates the second throwaway goal"

# Give: fill testGiveGoal's hole with "zero" (the chapter's own constructor).
cursor_in_cell_goal "$last_index" 0
ab eval "(() => {
  const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
  const view = cells[$last_index].cmTile.view
  const pos = view.state.selection.main.head
  view.dispatch({ changes: { from: pos, to: pos, insert: 'zero' } })
  return { ok: true }
})()"
press_agda_chord_in_cell "$last_index" " " "Space"
ab wait 5000 >/dev/null
assert_cell_contains "$last_index" "testGiveGoal = zero" "Give fills the goal with zero"
assert_log_contains "Give finished." "Give finishes"

# Give renumbers the remaining goal (?1 -> ?0) as part of its own follow-up
# recheck; re-Load explicitly before acting on it rather than trusting the
# client's tracked goal id to have already caught up to that renumbering by
# the time the next command dispatches (confirmed empirically: skipping
# this reload here intermittently sends Case split a stale interaction
# point id, which Agda rejects with "no such interaction point").
press_agda_chord_in_cell "$last_index" "l" "KeyL"
wait_for_log_contains "Load finished." 60000

# Case split: split testCaseSplit's hole on its bound variable "n".
cursor_in_cell_goal "$last_index" 0
press_agda_chord_in_cell "$last_index" "c" "KeyC"
ab wait 6000 >/dev/null
assert_cell_contains "$last_index" "testCaseSplit zero = {!   !}" "Case split zero clause"
assert_cell_contains "$last_index" "testCaseSplit (suc n) = {!   !}" "Case split successor clause"

echo "browser-test-plfa-basic: PASS"
