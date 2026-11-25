#!/usr/bin/env bash
set -euo pipefail

# Phones (390px): one header row (title, picker, icon-only Commands, a More
# menu with the app switcher / About / Settings), and a bottom tab bar
# showing the editor, Goals (with Agda's status) or Messages one at a time.
# A command that asks for input brings up Goals with its prompt focused; a
# result arriving brings up Messages.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

js() {
  ab eval "$1" | tail -n 1
}

visible() {
  js "(() => { const el = document.querySelector('$1'); return Boolean(el && el.getClientRects().length) })()"
}

pressed_tab() {
  js "document.querySelector('.mobile-tab[aria-pressed=true]')?.textContent.trim().split(/\\s+/)[0] ?? ''" | tr -d '"'
}

click_tab() {
  ab eval "(() => { [...document.querySelectorAll('.mobile-tab')].find(b => b.textContent.trim().startsWith('$1')).click(); return true })()" >/dev/null
  ab wait 300 >/dev/null
}

cleanup() {
  ab set viewport 1280 720 >/dev/null 2>&1 || true
}
trap cleanup EXIT

open_app
ab set viewport 390 844 >/dev/null
ab wait 500 >/dev/null
start_als

# ── Header: one row, More menu ──────────────────────────────────────────────
[[ "$(js "document.querySelector('.header').classList.contains('compact')")" == "true" ]] || fail "header isn't compact at 390px"
[[ "$(visible '.header .app-switcher')" == "false" ]] || fail "app switcher should move into the More menu"
ab eval "(() => { document.querySelector('.header-more-toggle').click(); return true })()" >/dev/null
ab wait 300 >/dev/null
menu_text="$(js "document.querySelector('#header-more-menu')?.textContent.replace(/\\s+/g, ' ').trim() ?? ''")"
for item in Playground Notebook About Settings; do
  [[ "$menu_text" == *"$item"* ]] || fail "More menu lacks $item: $menu_text"
done
ab press Escape >/dev/null
ab wait 200 >/dev/null
[[ "$(js "Boolean(document.querySelector('#header-more-menu'))")" == "false" ]] || fail "Escape didn't close the More menu"
[[ "$(js "document.activeElement?.classList.contains('header-more-toggle') ?? false")" == "true" ]] || fail "Escape didn't refocus the More toggle"
echo "PASS: compact header with a More menu"

# ── Tabs: one pane at a time ─────────────────────────────────────────────────
[[ "$(pressed_tab)" == "Code" ]] || fail "Code isn't the initial tab"
[[ "$(visible '.cm-content')" == "true" && "$(visible '.goals-section')" == "false" ]] || fail "Code tab should show only the editor"
set_editor_fixture "test-fixtures/agda/query-bool.agda" >/dev/null
load_agda >/dev/null
click_tab Goals
[[ "$(visible '.goals-section')" == "true" && "$(visible '.agda-status')" == "true" && "$(visible '.cm-content')" == "false" ]] \
  || fail "Goals tab should show status and goals only"
click_tab Messages
[[ "$(visible '.messages-panel')" == "true" && "$(visible '.goals-section')" == "false" ]] || fail "Messages tab should show only messages"
assert_log_contains "Load finished." "the log kept everything while its tab was hidden"
click_tab Code
echo "PASS: bottom tabs show the editor, Goals and Messages one at a time"

# ── A prompting command brings up Goals; its result brings up Messages ───────
ab eval "(() => { const v = document.querySelector('.cm-content').cmTile.view; v.dispatch({ selection: { anchor: 0 } }); v.focus(); return true })()" >/dev/null
press_agda_chord "z" "KeyZ" >/dev/null
ab wait 400 >/dev/null
[[ "$(pressed_tab)" == "Goals" ]] || fail "a prompt didn't bring up the Goals tab (on: $(pressed_tab))"
[[ "$(js "document.activeElement?.id ?? ''")" == '"command-input"' ]] || fail "the prompt's input isn't focused"
submit_command_prompt "Bool" >/dev/null
wait_for_log_contains "Search about finished." 30000
ab wait 300 >/dev/null
[[ "$(pressed_tab)" == "Messages" ]] || fail "a query result didn't bring up the Messages tab (on: $(pressed_tab))"
echo "PASS: prompts bring up Goals, results bring up Messages"

echo "PASS: mobile-tabs"
