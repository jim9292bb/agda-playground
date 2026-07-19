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

load_and_wait() {
  press_agda_chord "l" "KeyL"
  ab wait 1000 >/dev/null
  wait_for_log_contains "Load finished." 30000
}

# test-fixtures/agda/literate-truncation-demo.lagda.md has three blocks:
#   1. `data N`
#   2. a goal `test = {! one !}` referencing `one`
#   3. `one`'s definition, plus its own goal `test2 = {! one !}` that uses it
set_editor_fixture "test-fixtures/agda/literate-truncation-demo.lagda.md" "{! one !}" 3
load_and_wait
assert_log_contains "Load finished." "Block-scoped load of blocks 1+2 succeeds (the goal itself is still just a hole)"

# Part A: a command run from block 2 must not see block 3's `one`.
cursor_in_goal 0
press_agda_chord "r" "KeyR"
ab wait 5000

assert_log_matches "Refine failed:|\\[NotInScope\\]|Not in scope" "Refine cannot see \`one\` from block 3 when scoped to blocks 1+2"
assert_log_not_contains "Refine finished." "Refine did not silently succeed against invisible block-3 content"

# Part B: block 3's own goal (test2), which needs only content up through
# block 3, succeeds once the cursor -- and therefore the truncation
# boundary -- is actually in block 3. Note this necessarily re-triggers a
# fresh, wider-scoped load (every interaction command re-truncates from the
# current cursor position), which is exactly the point: a goal physically
# inside block 2 can never see block 3 by design, no matter what was loaded
# a moment earlier -- only a goal that itself lives at or after block 3 can.
cursor_in_goal 1
press_agda_chord "r" "KeyR"
ab wait 5000

assert_editor_contains "test2 = one" "Refine succeeds for block 3's own goal, which can see \`one\` (defined earlier in the same block)"
assert_log_contains "Refine finished." "Refine finishes once the cursor's block includes \`one\`'s definition"

# Load All: an explicit, cursor-position-independent full load, distinct
# from the auto-truncated per-command behavior above.
set_editor_fixture "test-fixtures/agda/literate-truncation-demo.lagda.md" "{! one !}" 3
ab eval "(() => {
  const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Load All')
  if (!button) throw new Error('Load All button not found')
  button.click()
  return { ok: true }
})()"
wait_for_log_contains "Load finished." 30000
assert_log_contains "Load finished." "Load All succeeds regardless of the cursor's block"

echo "browser-test-literate-truncation: PASS"
