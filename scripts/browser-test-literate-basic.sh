#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Must be set before sourcing browser-common.sh: it does
# APP_URL="${APP_URL:-http://127.0.0.1:8099/}" at its own top level, so
# setting this after sourcing would be a no-op (the variable would already
# be non-empty).
APP_URL="${APP_URL:-http://127.0.0.1:8099/literate}"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# The /literate route uses its own localStorage namespace (see
# AgdaController.docStorageKey and the *-literate shortcut-overrides/
# goals-panel-position keys in src/routes/literate/+page.svelte) so it
# doesn't share state with the default route -- but that also means
# open_app's clean-up (which only clears the default route's key) needs a
# literate-specific equivalent here.

open_app
ab eval "localStorage.removeItem('agda-playground-literate.shortcut-overrides.v1'); localStorage.removeItem('agda-web-ide-beta:doc:source.lagda.md'); location.reload()"
ab wait --load networkidle

start_als

assert_editor_contains '```agda' "default literate document has a fenced code block"

load_and_wait() {
  press_agda_chord "l" "KeyL"
  ab wait 1000 >/dev/null
  wait_for_log_contains "Load finished." 30000
}

set_editor_fixture "test-fixtures/agda/idN-auto.lagda.md" "{! !}" 3
load_and_wait

assert_editor_contains "idN n = {!" "Load creates a goal inside the fenced code block"
assert_log_contains "Load finished." "Load finishes for a .lagda.md document"

cursor_in_goal 0
press_agda_chord "a" "KeyA"
ab wait 5000

assert_editor_contains "idN n = n" "Auto fills the goal through the literate route"
assert_log_contains "Auto finished." "Auto finishes"

echo "browser-test-literate-basic: PASS"
