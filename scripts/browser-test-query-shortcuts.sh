#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Clear any shortcut overrides left by previous tests (e.g. browser-test-shortcut-overrides.sh)
ab eval "(() => { localStorage.removeItem('agda-playground.shortcut-overrides.v1'); return {ok:true} })()" 2>/dev/null || true
open_app
start_als

set_editor_fixture "test-fixtures/agda/query-bool.agda"
load_agda

run_toplevel_prompted_chord "z" "KeyZ" "Bool"
ab wait 2000

run_toplevel_prompted_chord "o" "KeyO" "Agda.Builtin.Bool"
ab wait 2000

run_toplevel_prompted_chord "w" "KeyW" "true"
ab wait 3000

assert_log_contains "Search about finished." "Search about response"
assert_log_contains "Module contents finished." "Module contents response"
assert_log_contains "Why in scope finished." "Why in scope response"

echo "browser-test-query-shortcuts: PASS"
