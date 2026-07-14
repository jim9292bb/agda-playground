#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
start_als

# Baseline: confirm the worker is genuinely functional before touching Restart.
set_editor_fixture "test-fixtures/agda/idN-auto.agda" "{! !}" 3
load_agda
assert_log_contains "Load finished." "Baseline load succeeds before restart"

# Click Restart. This calls restartALSWASM() -> stopALSWASM() -> startALSWASM(),
# which hits the "reusing worker" branch in startALSWASM() (the backend is
# already initialized, so it's reused rather than recreated). This branch was
# once known to deadlock the transport under an earlier runtime backend — this
# test locks in that it no longer reproduces with browser-wasi-shim-memfs.
click_button "Restart"

# start_als polls the Restart button's disabled state, which also covers the
# 'deactivating' -> 'exited' -> 'active' transition restartALSWASM() drives.
start_als

# The real assertion: the reused worker must still be able to run a full
# Load round-trip, not just report an "Active" status label.
set_editor_fixture "test-fixtures/agda/idN-auto.agda" "{! !}" 3
load_agda
assert_log_contains "Load finished." "Load succeeds after Restart reuses the worker"

echo "browser-test-restart-worker-reuse: PASS"
