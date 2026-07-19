#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

literate_open_app
start_als

# The default document is one markdown cell + one code cell -- no fence
# syntax should ever appear in any cell's own content (it's synthesized
# only when assembling cells into the document sent to Agda).
assert_cell_count 2 "default document: one markdown cell, one code cell"
ab eval "(() => {
  const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
  for (const el of cells) {
    const text = el.cmTile.view.state.doc.toString()
    if (text.includes('\`\`\`')) throw new Error('A cell\'s own content contains fence syntax: ' + text)
  }
  return { ok: true }
})()"
echo "PASS no cell's own content ever contains fence syntax"

set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! !}"

press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 30000
assert_cell_contains 0 "idN n = {!" "Load creates a goal inside the code cell"

cursor_in_cell_goal 0 0
press_agda_chord_in_cell 0 "a" "KeyA"
ab wait 5000 >/dev/null

assert_cell_contains 0 "idN n = n" "Auto fills the goal, synced back into the correct visible cell"
assert_log_contains "Auto finished." "Auto finishes"

echo "browser-test-literate-basic: PASS"
