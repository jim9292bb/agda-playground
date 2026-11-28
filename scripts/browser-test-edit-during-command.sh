#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regressions for edits made while a command runs. Its responses used to be
# dropped as stale while the command still logged "finished". Agda's
# positions are mapped through the edits instead (offsets.js), so:
# 1. Give with a keystroke 200 ms in: the goal is filled.
# 2. Load of a file with an error, with a keystroke 20 ms in: the error is
#    still reported.

# Types a newline at the end $2 ms after the first request containing $1.
edit_when_sent() {
  ab eval "(() => {
    const view = document.querySelector('.cm-content').cmTile.view
    const orig = console.log
    window.__fired = false
    console.log = function (...args) {
      try {
        if (!window.__fired && args[0] === '<--' && JSON.stringify(args[1] ?? '').includes('$1')) {
          window.__fired = true
          setTimeout(() => view.dispatch({ changes: { from: view.state.doc.length, insert: '\n' }, userEvent: 'input.type' }), $2)
        }
      } catch {}
      return orig.apply(this, args)
    }
    return true
  })()" >/dev/null
}
assert_edit_fired() {
  [[ "$(ab eval "window.__fired" | tail -n1)" == true ]] || { echo "FAIL: the edit was never made ($1)" >&2; exit 1; }
}

open_app
start_als

# --- 1. Give ---
set_editor_fixture test-fixtures/agda/slow-give.agda >/dev/null
load_agda
edit_when_sent Cmd_give 200
cursor_in_goal 0 >/dev/null
press_agda_chord " " "Space" >/dev/null
wait_for_log_matches "Give (failed|finished)" 30000
assert_edit_fired "Give"
assert_editor_contains "p = refl" "Give typed over is still applied"
assert_log_contains "Give finished." "Give finishes"

# --- 2. Load with an error ---
set_editor_fixture test-fixtures/agda/error-not-in-scope.agda >/dev/null
edit_when_sent Cmd_load 20
press_agda_chord "l" "KeyL" >/dev/null
wait_for_log_matches "Load (failed|finished)" 30000
assert_edit_fired "Load"
assert_log_contains "Load failed" "the Load's error is still reported"
assert_log_not_contains "Load finished."
