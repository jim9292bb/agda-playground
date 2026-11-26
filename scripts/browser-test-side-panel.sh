#!/usr/bin/env bash
set -euo pipefail

# The Agda side panel: status + environment menu (keyboard: opens on the
# selected option, arrows move, Escape closes back to the toggle), goals
# listed as `?n : type` with the active one expanded to its context, the
# Goals / Messages divider (keyboard-operable, remembered across reloads),
# and the Messages tabs (counts, copy button).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

SPLIT_KEY='agda-playground.goals-messages-split.v1'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

js() {
  ab eval "$1" | tail -n 1
}

open_app
ab eval "(() => { localStorage.removeItem('$SPLIT_KEY'); return true })()" >/dev/null
ab reload >/dev/null
wait_for_app_ready
start_als

# ── Status and environment menu ──────────────────────────────────────────────
[[ "$(js "document.querySelector('.agda-status-label')?.textContent.trim()")" == '"Active"' ]] || fail "status label isn't Active"
ab eval "(() => { document.querySelector('.agda-env-toggle').focus(); return true })()" >/dev/null
ab press Enter >/dev/null
ab wait 200 >/dev/null
[[ "$(js "document.activeElement?.getAttribute('aria-selected')")" == '"true"' ]] || fail "opening the environment menu didn't focus the selected option"
ab press ArrowDown >/dev/null
[[ "$(js "document.activeElement?.getAttribute('role')")" == '"option"' ]] || fail "ArrowDown left the options"
[[ "$(js "document.activeElement?.getAttribute('aria-selected')")" == '"false"' ]] || fail "ArrowDown didn't move to the next option"
ab press Escape >/dev/null
ab wait 200 >/dev/null
[[ "$(js "Boolean(document.querySelector('#agda-env-list'))")" == "false" ]] || fail "Escape didn't close the environment menu"
[[ "$(js "document.activeElement?.classList.contains('agda-env-toggle') ?? false")" == "true" ]] || fail "Escape didn't return focus to the environment toggle"
echo "PASS: environment menu opens on the selected option, moves with arrows, closes on Escape"

# ── Goals: list, active goal expanded with its context ───────────────
set_editor_fixture "test-fixtures/agda/query-goal.agda" "{! n !}" 4 >/dev/null
load_agda >/dev/null
ab wait 1500 >/dev/null
[[ "$(js "document.querySelectorAll('.goals-section .goal-entry').length")" == "1" ]] || fail "goals list should hold exactly one goal"
assert_active_goal_contains "?0 : N" "the active goal reads ?0 : N"
assert_active_goal_contains "n : N" "the active goal is expanded to its context"
[[ "$(js "document.querySelector('.goal-entry.active .goal-row')?.getAttribute('aria-expanded')")" == '"true"' ]] || fail "active goal row isn't aria-expanded"
echo "PASS: goals list shows ?n : type and expands the active goal"

# ── Goals / Messages divider: keyboard, remembered ──────────────────────────
divider='.agda-side-split [role=separator]'
before="$(js "document.querySelector('$divider').getAttribute('aria-valuenow')")"
ab eval "(() => { document.querySelector('$divider').focus(); return true })()" >/dev/null
ab press ArrowDown >/dev/null
ab press ArrowDown >/dev/null
after="$(js "document.querySelector('$divider').getAttribute('aria-valuenow')")"
[[ "${after//\"/}" -eq $(( ${before//\"/} + 10 )) ]] || fail "two ArrowDowns moved the divider from $before to $after, expected +10"
ab reload >/dev/null
wait_for_app_ready
remembered="$(js "document.querySelector('$divider').getAttribute('aria-valuenow')")"
[[ "$remembered" == "$after" ]] || fail "divider position not remembered across reload ($after before, $remembered after)"
echo "PASS: the Goals / Messages divider moves with the keyboard and is remembered"
ab eval "(() => { localStorage.removeItem('$SPLIT_KEY'); return true })()" >/dev/null

# ── Messages: segmented tabs, copy button ───────────────────────────────────
[[ "$(js "document.querySelector('.messages-tab.active')?.getAttribute('aria-pressed')")" == '"true"' ]] || fail "active Messages tab isn't aria-pressed"
[[ "$(js "document.querySelector('.messages-copy')?.getAttribute('aria-label')")" == '"Copy log"' ]] || fail "Messages copy button missing"
[[ "$(js "document.querySelector('.messages-log-empty, .messages-log-entry')?.textContent.trim() ?? ''")" != '"WIP"' ]] || fail "Messages still shows the WIP placeholder"
echo "PASS: Messages tabs are toggle buttons and there's a copy button"

echo "PASS: side-panel"
