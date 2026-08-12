#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# /literate has its own Next/Previous goal implementation
# (focusAdjacentGoal/focusGoal/focusGlobalPosition in +page.svelte),
# separate from the single-buffer `/` route's (see
# test:browser:goal-navigation) -- it has to translate a goal's hidden-
# document position into "which visible cell, and what local position
# within it" (computeCellContentOffsets/cellOffsetAtPos), then actually
# move DOM focus to that cell's own EditorView. Never covered by a browser
# test before; verified correct by hand first (see agda-command-behavior-
# reference.md-adjacent session notes), this locks that in.

literate_open_app
start_als

set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

a : N
a = ?"
click_toolbar_button "+ Code"
ab wait 500 >/dev/null
set_cell_content 1 "b : N
b = ?

c : N
c = ?"

# /literate only sends Agda everything up to and including the active
# cell -- Load from the last cell to register goals across both.
press_agda_chord_in_cell 1 "l" "KeyL"
wait_for_log_contains "Load finished." 30000

assert_cell_contains 0 "a = {!   !}" "Load creates a's goal in cell 0"
assert_cell_contains 1 "b = {!   !}" "Load creates b's goal in cell 1"
assert_cell_contains 1 "c = {!   !}" "Load creates c's goal in cell 1"

# Reports which cell currently has DOM focus, and that cell's cursor head.
focused_cell_and_head() {
  ab eval "(() => {
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    for (let i = 0; i < cells.length; i++) {
      const view = cells[i].cmTile.view
      if (document.activeElement === view.contentDOM) {
        return { cell: i, head: view.state.selection.main.head }
      }
    }
    return { cell: -1, head: -1 }
  })()"
}

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

# Put the cursor at the very start of cell 0 (not inside any goal), then
# step through all three goals with Next goal, crossing the cell boundary.
ab eval "(() => {
  const view = document.querySelectorAll('.literate-cell-editor .cm-content')[0].cmTile.view
  view.dispatch({ selection: { anchor: 0 } })
  view.focus()
  return { ok: true }
})()"

press_agda_chord_in_cell 0 "f" "KeyF"
ab wait 300 >/dev/null
assert_focused_cell 0 "Next goal from document start lands on a (cell 0)"

press_agda_chord_in_cell 0 "f" "KeyF"
ab wait 300 >/dev/null
assert_focused_cell 1 "Next goal crosses the cell boundary onto b (cell 1)"

press_agda_chord_in_cell 1 "f" "KeyF"
ab wait 300 >/dev/null
assert_focused_cell 1 "Next goal advances to c, still in cell 1"

press_agda_chord_in_cell 1 "f" "KeyF"
ab wait 300 >/dev/null
assert_focused_cell 0 "Next goal wraps around from the last goal back to a (cell 0)"

press_agda_chord_in_cell 0 "b" "KeyB"
ab wait 300 >/dev/null
assert_focused_cell 1 "Previous goal wraps backward from a (cell 0) to c (cell 1)"

echo "browser-test-literate-goal-navigation: PASS"
