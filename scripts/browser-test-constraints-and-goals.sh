#!/usr/bin/env bash
# Show constraints (C-c C-=) lists Agda's open constraints in the Queries
# panel, formatted as Agda's Emacs mode prints them; Show goals (C-c C-?)
# lists every goal and unsolved meta, as after Load; Solve constraints
# (C-c C-s) outside any goal fills in every goal Agda's constraints decide.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
start_als

set_editor_fixture "test-fixtures/agda/constraints-solve.agda"
load_agda

press_agda_chord "=" "Equal"
wait_for_log_contains "Show constraints finished." 20000
latest_query="$(ab eval "(() => (document.querySelector('.messages-panel')?.dataset.queryResults ?? '').split('\\n---\\n')[0])()")"
for needle in '?0 := z' 'g _17 = z : N (blocked on _17, belongs to problem' '_18 := refl (blocked on problem'; do
  if [[ "$latest_query" != *"$needle"* ]]; then
    echo "FAIL Show constraints result lacks $needle: $latest_query" >&2
    exit 1
  fi
done
echo "PASS Show constraints lists the open constraints"

press_agda_chord "?" "Slash"
wait_for_log_contains "Show goals finished." 20000
assert_log_contains "?0 : N" "Show goals lists the goal"
assert_log_contains "_17 : N" "Show goals names the unsolved meta as Agda does"

press_agda_chord "s" "KeyS"
wait_for_log_contains "Solve constraints finished." 20000
assert_log_contains "1 goal solved." "Solve constraints reports what it solved"
assert_editor_contains "p = refl {x = z}" "Solve constraints gives the solution"
assert_editor_contains "r = refl" "Solve constraints leaves the rest alone"

# Nothing left to solve: Agda answers with no solutions.
press_agda_chord "s" "KeyS"
wait_for_log_matches "Solve constraints finished\\.[\\s\\S]*Solve constraints finished\\." 20000
assert_log_contains "No solutions found." "a second Solve has nothing left to fill in"

echo "browser-test-constraints-and-goals: PASS"
