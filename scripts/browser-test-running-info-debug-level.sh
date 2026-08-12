#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
start_als

# agda-mode-vscode (and Agda's own Emacs backend, EmacsTop.hs's
# `n <= 1 -> displayRunningInfo | otherwise -> displayVerboseInfo`) only
# surfaces debugLevel <= 1 RunningInfo messages in the user-visible panel;
# higher debug levels go to an internal-only sink. Verify als-demo matches:
# a debugLevel 1 message appears in the visible log, a debugLevel 2 message
# does not.
ab eval "(async () => {
  const { emitRunningInfo } = await import('/src/lib/agda/effects.js')
  const view = document.querySelector('.cm-content')?.cmTile?.view
  if (!view) throw new Error('missing editor view')
  view.dispatch({ effects: emitRunningInfo.of({ message: 'VISIBLE_DEBUG1_MARKER\n', debugLevel: 1 }) })
  view.dispatch({ effects: emitRunningInfo.of({ message: 'HIDDEN_DEBUG2_MARKER\n', debugLevel: 2 }) })
  return { ok: true }
})()"

assert_log_contains "VISIBLE_DEBUG1_MARKER" "debugLevel 1 RunningInfo is shown in the visible log"
assert_log_not_contains "HIDDEN_DEBUG2_MARKER" "debugLevel 2 RunningInfo is NOT shown in the visible log"

echo "browser-test-running-info-debug-level: PASS"
