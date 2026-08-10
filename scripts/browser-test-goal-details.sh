#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
start_als

set_editor_fixture "test-fixtures/agda/plus-case-split.agda" "?" 0
load_agda
ab wait 4000

assert_active_goal_contains "?0" "Active goal id"
assert_active_goal_contains "?0 : N" "Active goal type"
assert_active_goal_contains "a : N" "Active goal context includes a"
assert_active_goal_contains "b : N" "Active goal context includes b"

assert_log_contains "Load finished." "Load finishes"
assert_log_not_contains "a : N" "Silent goal detail query does not write context to log"
assert_log_not_contains "b : N" "Silent goal detail query does not write context to log"

# C-c C-e (Context) -- regression for a bug where the top-level ALS
# `kind: "Context"` response (distinct from the GoalSpecific-nested kind
# handlers.js already handled for C-c C-,) had no case in
# handlers.js's getQueryResult, so it fell through to formatDisplayInfo's
# default branch and got dumped as raw JSON into the running-info log
# instead of appearing as a formatted entry in the Queries panel.
cursor_in_goal 0
press_agda_chord "e" "KeyE"
ab wait 2000
assert_queries_contains "a : N" "Context query shows a : N in the Queries panel"
assert_queries_contains "b : N" "Context query shows b : N in the Queries panel"
assert_log_not_contains "\"kind\":\"Context\"" "Context response is not dumped as raw JSON into the log"

# C-c C-d (Infer type) -- regression for using the Normalised normalization
# mode instead of Simplified. agda-mode-vscode's base (unprefixed) C-c C-d
# binding is Simplified; Normalised is only reachable there via the C-u
# prefix, which this project deliberately does not implement, so silently
# defaulting to Normalised diverged from the reference behavior.
cursor_in_goal 0
press_agda_chord "d" "KeyD"
ab wait 500
submit_command_prompt "a"
ab wait 2000
assert_queries_contains "N" "Infer type of a is N"

# C-c C-. / C-c C-; (Goal type+context+inferred/checked type) -- regression
# for a bug where handlers.js's GoalType formatting ignored the `typeAux`
# field entirely, so a goal already containing a partial term (here `n`)
# never showed the "Have: <type>" / "Elaborates to: <term>" line Agda's own
# EmacsTop.hs includes (Cmd_goal_type_context_infer/_check are the only two
# commands that populate typeAux -- plain C-c C-, always sends GoalOnly, so
# it correctly never shows this line).
set_editor_fixture "test-fixtures/agda/idN-elaborate.agda"
load_agda
cursor_in_goal 0
press_agda_chord "." "Period"
ab wait 2000
assert_queries_contains "Have:" "Goal type/context/inferred type shows a Have: line for a goal with content"

cursor_in_goal 0
press_agda_chord ";" "Semicolon"
ab wait 2000
assert_queries_contains "Elaborates to:" "Goal type/context/checked type shows an Elaborates to: line"

echo "browser-test-goal-details: PASS"
