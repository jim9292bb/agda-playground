#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regressions for commands that overlap (they now run one at a time, each
# with its own result -- agda-mode-vscode queues them too):
# 1. A slow Compute, then a Give 200 ms later: the Compute used to report
#    the Give's type error ("Compute failed: ... UnequalTerms").
# 2. Restart while a Compute runs: the Compute used to stay pending and log
#    "finished" when an unrelated later command ended.

log_since_mark() {
  ab eval "(document.querySelector('.messages-panel')?.dataset.logContent ?? '').slice(window.__logStart ?? 0)" | tail -n1
}

# Runs $1 (JS) 200 ms after the Cmd_compute request is sent.
when_compute_is_sent() {
  ab eval "(() => {
    const orig = console.log
    window.__fired = false
    console.log = function (...args) {
      try {
        if (!window.__fired && args[0] === '<--' && JSON.stringify(args[1] ?? '').includes('Cmd_compute')) {
          window.__fired = true
          setTimeout(() => { $1 }, 200)
        }
      } catch {}
      return orig.apply(this, args)
    }
    window.__logStart = (document.querySelector('.messages-panel')?.dataset.logContent ?? '').length
    return true
  })()" >/dev/null
}

open_app
start_als
set_editor_fixture test-fixtures/agda/slow-compute.agda >/dev/null
load_agda

# --- 1. Compute, then an ill-typed Give while it runs ---
when_compute_is_sent "
  const view = document.querySelector('.cm-content').cmTile.view
  const target = document.querySelector('.cm-content')
  view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('{! s s') + 3 } })
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true, cancelable: true }))
  target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true, cancelable: true }))"
cursor_in_goal 0 >/dev/null
press_agda_chord "n" "KeyN" >/dev/null
wait_for_log_matches "Give (failed|finished)" 60000
ab wait 1000 >/dev/null
log="$(log_since_mark)"
if [[ "$log" != *"Compute finished."* || "$log" == *"Compute failed"* || "$log" != *"Give failed:"* ]]; then
  echo "FAIL: overlapping Compute and Give did not report their own outcomes: $log" >&2; exit 1
fi
echo "PASS: overlapping commands each report their own outcome"

# --- 2. Restart while a Compute runs ---
when_compute_is_sent "
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Restart')?.click()"
cursor_in_goal 0 >/dev/null
press_agda_chord "n" "KeyN" >/dev/null
ab wait 1000 >/dev/null
start_als >/dev/null
wait_for_log_matches "Compute (failed|finished)" 30000
log="$(log_since_mark)"
if [[ "$log" != *"Compute failed: Agda was restarted"* ]]; then
  echo "FAIL: the Compute interrupted by Restart was not reported as interrupted: $log" >&2; exit 1
fi
echo "PASS: a command interrupted by Restart fails at once"
