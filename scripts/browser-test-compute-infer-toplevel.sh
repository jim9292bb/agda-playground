#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# agda-mode-vscode's Compute normal form / Infer type fall back to the
# `_toplevel` protocol variant (Cmd_compute_toplevel / Cmd_infer_toplevel)
# and prompt for an expression when the cursor isn't inside a goal
# (State__Command.res: `switch Goals.getGoalAtCursor(...) { None => prompt
# -> *Global request | Some(goal) => ... }`). als-demo previously required
# a goal for both (`requireGoal`), throwing "Place the cursor inside a goal
# first" instead of falling back -- a real conflict, now fixed to match.

open_app
start_als

load_and_wait() {
  click_button Load
  ab wait 1000 >/dev/null
  wait_for_log_contains "Load finished." 30000
}

# A fixture with zero goals: als-demo's single-goal fallback in
# shortcut-context.js (getGoalInfoFallback's `allowOnlyGoalFallback`) would
# otherwise auto-target the sole goal regardless of cursor position, which
# would defeat this test's "no active goal" scenario.
set_editor_fixture "test-fixtures/agda/plus-complete.agda"
load_and_wait

press_agda_chord "n" "KeyN"
ab wait 500
assert_command_prompt "Input for Compute"
submit_command_prompt "z + s z"
ab wait 2000
assert_queries_contains "s z" "Compute normal form (toplevel) reduces z + s z to s z"
assert_log_contains "Compute finished." "Compute (toplevel) finishes"

press_agda_chord "d" "KeyD"
ab wait 500
assert_command_prompt "Input for Infer type"
submit_command_prompt "z + s z"
ab wait 2000
assert_queries_contains "N" "Infer type (toplevel) infers the type of z + s z as N"
assert_log_contains "Infer type finished." "Infer type (toplevel) finishes"

echo "browser-test-compute-infer-toplevel: PASS"
