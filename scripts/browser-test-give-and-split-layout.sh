#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regressions for code Give and Case split wrote into the buffer:
# 1. A long Elaborate-and-give result comes back from Agda over two lines.
#    The second line was inserted at column 0, which ends `module M where`'s
#    block, so the next Load failed. Expected: indented to the goal's column
#    (Emacs agda2-replace-goal).
# 2. Case split in `f x y = ? , ?` kept `, {!   !}` after the goal, although
#    Agda's clauses reprint the whole line (Emacs agda2-make-case-action
#    deletes to the end of the line), so the reload failed to parse.

wait_until_reloaded() {
  local previous="$1" log
  for _ in $(seq 1 120); do
    log="$(log_text)"
    if [[ "$log" == *'Load finished.'* && "$log" != *"$previous"* ]]; then return 0; fi
    ab wait 500 >/dev/null
  done
  echo "FAIL: no successful reload after $previous: $(log_text)" >&2
  exit 1
}

open_app
start_als

# --- 1. multi-line Elaborate and give ---
set_editor_fixture test-fixtures/agda/multiline-give.agda >/dev/null
load_agda
set_goal_content 0 'aVeryLongFunctionName (aVeryLongFunctionName (s z) (s z)) (aVeryLongFunctionName (s z) (s z))' >/dev/null
press_agda_chord "m" "KeyM"
wait_for_log_contains "Elaborate and give finished." 30000
text="$(editor_text)"
if [[ "$text" != *'(s z))\n      (aVeryLongFunctionName'* ]]; then
  echo "FAIL: continuation line not indented to the goal column: $text" >&2; exit 1
fi
load_agda
assert_log_not_contains "error"
echo "PASS: multi-line Give result stays inside the clause"

# --- 2. Case split with a second goal on the line ---
set_editor_fixture test-fixtures/agda/case-split-whole-line.agda >/dev/null
load_agda
set_goal_content 0 "x" >/dev/null
press_agda_chord "c" "KeyC"
wait_until_reloaded "Case split..."
text="$(editor_text)"
if [[ "$text" != *'f z y = {!   !} , {!   !}\nf (s x) y = {!   !} , {!   !}\n'* ]]; then
  echo "FAIL: Case split left text after the goal: $text" >&2; exit 1
fi
echo "PASS: Case split replaces the whole clause line"
