#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# Switching chapters (selectPlfaChapter -> replaceScratchpadSource in
# +page.svelte) should fully replace the notebook's cells and its Agda
# session state -- a goal created while working on one chapter must not
# leak into the next chapter picked from the dropdown.

plfa_open_app
start_als

select_plfa_chapter "Naturals"
ab wait 500 >/dev/null
assert_cell_contains 0 "data ℕ : Set where" "Naturals chapter's own opening cell is loaded"

append_cell_content 0 "

testLeakGoal : ℕ
testLeakGoal = {! !}"
press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 60000
assert_cell_contains 0 "testLeakGoal = {!" "A goal exists in the Naturals chapter before switching away"

select_plfa_chapter "Induction"
ab wait 1000 >/dev/null

# The Induction chapter's own opening cell is completely different content
# -- confirms the switch actually replaced the cells, not just appended.
assert_cell_contains 0 "Relation.Binary.PropositionalEquality" \
  "Switching to Induction replaces cell 0 with its own opening content"

ab eval "(() => {
  const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
  for (const el of cells) {
    const text = el.cmTile.view.state.doc.toString()
    if (text.includes('testLeakGoal')) {
      throw new Error('The Naturals chapter\'s throwaway goal leaked into Induction\'s cells')
    }
  }
  return { ok: true }
})()"
echo "PASS the Naturals chapter's throwaway goal did not leak into Induction's cells"

ab eval "(() => {
  const goalsPanel = Array.from(document.querySelectorAll('*')).find(el =>
    el.children.length === 0 && el.textContent.trim() === 'No goals.')
  if (!goalsPanel) throw new Error('Goals panel does not show \"No goals.\" after switching chapters')
  return { ok: true }
})()"
echo "PASS Goals panel shows \"No goals.\" after switching chapters (goal state did not leak)"

echo "browser-test-plfa-chapter-switching: PASS"
