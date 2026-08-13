#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# agda-mode-vscode always shows the latest response in its single panel
# (State__View.Panel.display), rather than requiring the user to manually
# switch views. als-demo's Messages panel keeps its Log/Queries/Errors
# split, but should auto-switch to whichever tab a new result belongs to --
# edge-triggered on a genuine increase in results/diagnostics, so a user who
# manually navigates elsewhere isn't fought when nothing new has happened.

active_messages_tab() {
  ab eval "(() => {
    const tab = document.querySelector('.messages-tab-group .messages-tab.active')
    if (!tab) throw new Error('No active Messages tab')
    return tab.textContent.trim().split(' ')[0].split('(')[0].trim()
  })()"
}

click_messages_tab() {
  local label="$1"
  ab eval "(() => {
    const tab = Array.from(document.querySelectorAll('.messages-tab-group .messages-tab'))
      .find(button => button.textContent.trim().startsWith('$label'))
    if (!tab) throw new Error('Messages tab not found: $label')
    tab.click()
    return { ok: true }
  })()"
}

open_app
start_als

set_editor_fixture "test-fixtures/agda/plus-refine-ambiguous.agda" "?" 0
load_agda

result="$(active_messages_tab)"
if [[ "$result" != *'"Log"'* ]]; then
  echo "Expected Log tab active by default after Load, got: $result" >&2
  exit 1
fi
echo "PASS Log tab is active by default"

# A new query result auto-switches to Queries, even though we're on Log.
press_agda_chord "z" "KeyZ"
ab wait 500
submit_command_prompt "N"
ab wait 2000

result="$(active_messages_tab)"
if [[ "$result" != *'"Queries'* ]]; then
  echo "Expected auto-switch to Queries tab after a new query result, got: $result" >&2
  exit 1
fi
echo "PASS new query result auto-switches to Queries tab"

# Manually navigate back to Log; without a new event, nothing should force
# us away from it.
click_messages_tab "Log"
ab wait 300
result="$(active_messages_tab)"
if [[ "$result" != *'"Log"'* ]]; then
  echo "Expected manual switch back to Log to stick, got: $result" >&2
  exit 1
fi
echo "PASS manually switching to Log sticks when nothing new has happened"

# A new diagnostic auto-switches to Errors, even though we're on Log.
set_editor_fixture "test-fixtures/agda/error-not-in-scope.agda"
click_button Load
wait_for_log_matches "Load failed:|\\[NotInScope\\]|Not in scope" 30000

result="$(active_messages_tab)"
if [[ "$result" != *'"Errors'* ]]; then
  echo "Expected auto-switch to Errors tab after a new diagnostic, got: $result" >&2
  exit 1
fi
echo "PASS new diagnostic auto-switches to Errors tab"

echo "browser-test-messages-tab-auto-switch: PASS"
