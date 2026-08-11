#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression for a bug where Case split ignored the MakeCase response's
# `variant` field (Function vs ExtendedLambda) and always inserted the
# returned clauses as new top-level lines. Inside an extended lambda
# (`λ { x -> ? }` or `λ where x -> ?`) that produces syntactically-broken
# Agda source, since the goal sits inside a single expression, not a
# sequence of top-level declarations. agda-mode-vscode distinguishes the two
# (Goal.res's replaceWithLines vs replaceWithLambda); als-demo now does too.

open_app
start_als

load_and_wait() {
  click_button Load
  ab wait 1000 >/dev/null
  wait_for_log_contains "Load finished." 30000
}

set_editor_fixture "test-fixtures/agda/isZero-extended-lambda.agda"
load_and_wait

set_goal_content 0 "x"
press_agda_chord "c" "KeyC"
ab wait 6000

assert_editor_contains "isZero = λ { z" "Case split zero clause stays inside the lambda braces"
assert_editor_contains "; (s x)" "Case split successor clause is semicolon-joined, not a new top-level line"

echo "browser-test-case-split-extended-lambda: PASS"
