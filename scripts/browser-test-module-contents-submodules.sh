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

set_editor_fixture "test-fixtures/agda/module-contents-submodules.agda"
load_and_wait

select_text "Outer"
press_agda_chord "o" "KeyO"
ab wait 3000

assert_log_contains "Module contents finished." "Module contents response"
assert_queries_contains $'Modules:\nNested' "The Nested submodule is listed under a Modules section"
assert_queries_contains $'Names:\nouterValue : Set' "Top-level names are still listed under a Names section"

echo "browser-test-module-contents-submodules: PASS"
