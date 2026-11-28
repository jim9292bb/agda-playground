#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression: in `h = {!!} {!!}` Agda never reaches the second goal, so its
# type request fails (NoActionForInteractionPoint). The Goals panel's
# background fetch retried it forever (~20 requests/s while idle), and its
# error was then reported as the next Give's failure. Expected: one attempt
# per goal and document version, and Give reports its own success.

open_app
start_als
ab eval "(() => { window.__sent = []; const o = console.log; console.log = function (...a) { if (a[0] === '<--') { const s = JSON.stringify(a[1]); if (s.includes('IOTCM')) window.__sent.push(s) } return o.apply(this, a) }; return true })()" >/dev/null
set_editor_fixture test-fixtures/agda/unreached-goal.agda "z !}" 0 >/dev/null
load_agda
count() { ab eval "window.__sent.filter(s => s.includes('Cmd_goal_type_context Simplified 2')).length" | tr -d '"'; }
ab wait 2000 >/dev/null
before="$(count)"
ab wait 5000 >/dev/null
after="$(count)"
if (( after - before > 1 )); then
  echo "FAIL: $((after - before)) background type requests for the unreached goal in 5 s of idling" >&2; exit 1
fi
echo "PASS: the unreached goal's type is fetched at most once ($before, then $after)"

cursor_in_goal 0 >/dev/null
press_agda_chord " " "Space" >/dev/null
wait_for_log_matches "Give (failed|finished)" 30000
assert_log_contains "Give finished." "Give reports its own success"
assert_editor_contains $'g = z\n' "the goal is filled"
