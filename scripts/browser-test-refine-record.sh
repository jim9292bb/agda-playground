#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression: Refine on a record-typed goal at the end of the file. Agda's
# InteractionPoints after the GiveAction carry positions for its own copy of
# the file, past the end of the edited buffer. Mapping them threw, the
# exception stopped the transport, and every later command timed out.
# Expected: the new holes are registered by the reload that follows.

open_app
start_als
set_editor_fixture test-fixtures/agda/refine-record.agda >/dev/null
load_agda
cursor_in_goal 0 >/dev/null
press_agda_chord "r" "KeyR"

ok=false
for _ in $(seq 1 120); do
  log="$(log_text)"
  if [[ "$(editor_text)" == *'record { a = {!   !} ; b = {!   !} }'* && "$log" == *'Load finished.'* && "$log" == *'?1 : N'* && "$log" != *'Refine...'* ]]; then
    ok=true; break
  fi
  ab wait 500 >/dev/null
done
[[ "$ok" == true ]] || { echo "FAIL: Refine did not finish with two new goals: $(editor_text) / $(log_text)" >&2; exit 1; }
echo "PASS: Refine registers the record's field goals"

# The transport still works: Give into the first new goal.
cursor_in_goal 0 >/dev/null
set_goal_content 0 "z" >/dev/null
press_agda_chord " " "Space"
wait_for_log_contains "Give finished." 30000
assert_editor_contains 'record { a = z ; b = {!   !} }' "Give after Refine"
