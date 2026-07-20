#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

literate_open_app
start_als

# Two code cells: the first defines N and has a goal referencing `one`,
# which is only defined in the *second* cell. Running a command from the
# first cell must not be able to see it (the core literate-programming
# truncation rule, now enforced across N separate EditorViews instead of
# regions of one buffer) -- and running from the second cell, whose own
# content includes both `one`'s definition and its own equivalent goal,
# must succeed.
set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

test : N
test = {! one !}"

click_toolbar_button "+ Code"
assert_cell_count 3 "inserted a third cell after the second"

set_cell_content 1 "one : N
one = s z

test2 : N
test2 = {! one !}"

press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 30000

run_agda_chord_at_cell_goal 0 0 "r" "KeyR"
wait_for_log_matches "NotInScope" 15000
assert_log_contains "one" "log mentions the out-of-scope name"
assert_cell_contains 0 "test = {! one !}" "the first cell's own goal is left untouched by the failed Refine"
echo "PASS Refine from the first cell cannot see \`one\`, which is only defined in the second cell"

run_agda_chord_at_cell_goal 1 0 "r" "KeyR"
wait_for_log_contains "Refine finished." 15000
assert_cell_contains 1 "test2 = one" "Refine succeeds once the active cell's own content includes \`one\`'s definition, and syncs back into the correct visible cell"

echo "browser-test-literate-truncation: PASS"
