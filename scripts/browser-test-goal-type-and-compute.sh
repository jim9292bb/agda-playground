#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Coverage for three query commands that had no dedicated browser test:
# Goal type (C-c C-t), Goal type and context (C-c C-,), and Compute normal
# form (C-c C-n). Ground-truth expected shapes cross-checked against
# agda-mode-vscode's Test__GoalType.res / Test__GoalTypeAndContext.res /
# Test__ComputeNormalForm.res and Agda's own interaction golden tests --
# see /home/jim/agda-scratchpad/agda-command-behavior-reference.md.

open_app
start_als

load_and_wait() {
  click_button Load
  ab wait 1000 >/dev/null
  wait_for_log_contains "Load finished." 30000
}

set_editor_fixture "test-fixtures/agda/plus-case-split.agda" "?" 0
load_and_wait

# C-c C-t (Goal type) -- bare type only, no "Goal:" label, no context, no
# separator (matches agda-mode-vscode's DisplayInfo(CurrentGoal("ℕ"))
# shape: als-demo's own CurrentGoal handler already produces this).
cursor_in_goal 0
press_agda_chord "t" "KeyT"
ab wait 2000
assert_queries_contains "N" "Goal type shows the bare goal type"
assert_log_not_contains "\"kind\":\"CurrentGoal\"" "Goal type response is not dumped as raw JSON into the log"

# C-c C-, (Goal type and context) -- type, a separator line, then context
# entries. Unlike agda-mode-vscode (which prefixes "Goal: " and lists
# context in reverse declaration order), als-demo shows the bare type with
# no prefix and context in declaration order (a, b) -- documented in
# agda-command-behavior-reference.md's Context/GoalTypeAndContext notes as
# a real behavioral difference between the two, not asserted here as a bug.
cursor_in_goal 0
press_agda_chord "," "Comma"
ab wait 2000
assert_queries_contains $'N\n────────────────────────────────────────────────────────────\na : N\nb : N' \
  "Goal type and context shows type, separator, then context in declaration order"

# C-c C-n (Compute normal form) -- reduces a closed expression using the
# goal's local context/definitions. `z + s z` only exercises the fully-given
# `z + b = b` clause of `_+_`, so it reduces to `s z` without getting stuck
# on the still-open goal in the other clause.
set_editor_fixture "test-fixtures/agda/plus-refine-ambiguous.agda" "?" 0
load_and_wait
cursor_in_goal 0
press_agda_chord "n" "KeyN"
ab wait 500
submit_command_prompt "z + s z"
ab wait 2000
assert_queries_contains "s z" "Compute normal form reduces z + s z to s z"
assert_log_contains "Compute finished." "Compute finishes"

echo "browser-test-goal-type-and-compute: PASS"
