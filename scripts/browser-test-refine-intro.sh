#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
start_als

load_and_wait() {
  click_button Load
  ab wait 1000 >/dev/null
  wait_for_log_contains "Load finished." 30000
}

# C-c C-r (Refine) on an *empty* goal -- Agda's own Cmd_refine_or_intro treats
# empty content as "intro" (auto-introduce a constructor), not as "missing
# input". Regression for a bug where every content-requiring shortcut
# (Give/Refine/Elaborate-give/...) shared one blanket "prompt for input when
# empty" rule in run-shortcut.js, which pre-empted Refine's own request
# before Agda ever saw it -- silently discarding this real, distinct Agda
# behavior in both directions:
#
#   1. Ambiguous goal (N has two constructors, z and s): real Agda reports
#      "Don't know which constructor to introduce of z or s" via a DisplayInfo
#      this app didn't even have a case for (IntroConstructorUnknown) --
#      previously neither of these things ever happened, since the client
#      intercepted the request and opened an input prompt instead.
#   2. Unambiguous goal (a record with exactly one constructor): real Agda
#      auto-fills the goal outright, zero user input required -- previously
#      the client always demanded the user type the constructor name by hand.

set_editor_fixture "test-fixtures/agda/plus-refine-ambiguous.agda"
load_and_wait
cursor_in_goal 0
press_agda_chord "r" "KeyR"
ab wait 4000

assert_no_command_prompt
assert_queries_contains "Don't know which constructor to introduce of z or s" \
  "Refine on an ambiguous empty goal reports Agda's own Intro error instead of prompting for input"
assert_editor_contains "s a + b = {!  !}" "Ambiguous goal is left untouched"

set_editor_fixture "test-fixtures/agda/refine-intro-unit.agda"
load_and_wait
cursor_in_goal 0
press_agda_chord "r" "KeyR"
ab wait 4000

assert_editor_contains "goalUnit = tt" "Refine on an unambiguous empty goal auto-fills with zero input"
assert_log_contains "Refine finished." "Refine finishes"

echo "browser-test-refine-intro: PASS"
