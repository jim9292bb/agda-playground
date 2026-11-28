#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# Regression: picking another chapter while a Load runs logged "Load
# finished." for a chapter that was never checked. Expected: the Load is
# reported as failed because its document was replaced.

plfa_open_app >/dev/null
start_als >/dev/null
select_plfa_chapter "Properties" >/dev/null
n=$(editor_cell_count); last=$((n-1))
append_cell_content "$last" "

bad : Set
bad = Set" >/dev/null
press_agda_chord_in_cell "$last" l KeyL >/dev/null
# Properties takes several seconds to check; switch while Cmd_load is running.
ab wait 2500 >/dev/null
select_plfa_chapter "Naturals" >/dev/null
wait_for_log_matches 'Load (finished|failed)' 120000 || true
ab wait 1500 >/dev/null
assert_log_contains "Load failed: the document was replaced" "the interrupted Load says why it failed"
assert_log_not_contains "Load finished."
