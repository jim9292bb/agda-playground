#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# /plfa's Next/Previous goal implementation (focusAdjacentGoal/focusGoal/
# focusGlobalPosition in +page.svelte) is confirmed byte-identical to
# /literate's (see browser-test-literate-goal-navigation.sh's commit for
# the manual verification) -- this locks that in against real PLFA chapter
# content rather than a hand-typed fixture, using two throwaway goals
# appended to two different pre-existing chapter cells.

plfa_open_app
start_als

select_plfa_chapter "Naturals"
ab wait 500 >/dev/null

# Cell 0: `data ℕ : Set where zero : ℕ ...`. Cell 1: `seven : ℕ; seven = zero`.
append_cell_content 0 "

testGoalA : ℕ
testGoalA = {! !}"
append_cell_content 1 "

testGoalB : ℕ
testGoalB = {! !}"

press_agda_chord_in_cell 1 "l" "KeyL"
wait_for_log_contains "Load finished." 60000
assert_cell_contains 0 "testGoalA = {!" "Load creates testGoalA's goal in cell 0"
assert_cell_contains 1 "testGoalB = {!" "Load creates testGoalB's goal in cell 1"

# Reports which cell currently has DOM focus, and that cell's cursor head.
assert_focused_cell() {
  local expectedCell="$1" label="$2"
  ab eval "(() => {
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    const expected = $expectedCell
    for (let i = 0; i < cells.length; i++) {
      const view = cells[i].cmTile.view
      if (document.activeElement === view.contentDOM) {
        if (i !== expected) throw new Error('Expected focus on cell ' + expected + ' but found cell ' + i)
        const head = view.state.selection.main.head
        const doc = view.state.doc.toString()
        if (!/\{!\s*!\}/.test(doc.slice(Math.max(0, head - 5), head + 5))) {
          throw new Error('Cursor is not inside a goal hole: ' + doc.slice(Math.max(0, head - 5), head + 5))
        }
        return { ok: true, cell: i, head }
      }
    }
    throw new Error('No cell has DOM focus')
  })()"
  echo "PASS $label"
}

# Start at the very beginning of cell 0 (not inside any goal).
ab eval "(() => {
  const view = document.querySelectorAll('.literate-cell-editor .cm-content')[0].cmTile.view
  view.dispatch({ selection: { anchor: 0 } })
  view.focus()
  return { ok: true }
})()"

press_agda_chord_in_cell 0 "f" "KeyF"
ab wait 300 >/dev/null
assert_focused_cell 0 "Next goal from cell start lands on testGoalA (cell 0)"

press_agda_chord_in_cell 0 "f" "KeyF"
ab wait 300 >/dev/null
assert_focused_cell 1 "Next goal crosses the cell boundary onto testGoalB (cell 1)"

press_agda_chord_in_cell 1 "f" "KeyF"
ab wait 300 >/dev/null
assert_focused_cell 0 "Next goal wraps around from the last goal back to testGoalA (cell 0)"

press_agda_chord_in_cell 0 "b" "KeyB"
ab wait 300 >/dev/null
assert_focused_cell 1 "Previous goal wraps backward from testGoalA (cell 0) to testGoalB (cell 1)"

echo "browser-test-plfa-goal-navigation: PASS"
