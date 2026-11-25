#!/usr/bin/env bash
set -euo pipefail

# Phones (390px): one header row (the mark, the app switcher, theme / About /
# Settings icons), the editor head (picker, icon-only Commands, a More
# actions menu), then the editor over the Agda panel. The panel's bar has a status dot (opens status + environment),
# a Goals / Messages switch and a chevron that collapses the panel to a
# one-line summary of the current goal. A command asking for input opens
# the panel on Goals with its prompt focused; a result switches to Messages.
# (Collapsing on its own while the on-screen keyboard is up needs a real
# keyboard; MobilePanelState's logic is unit-tested instead.)

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

shown_panel() {
  js "document.querySelector('.mobile-switch button[aria-pressed=true]')?.textContent.trim().split(/\\s+/)[0] ?? ''" | tr -d '"'
}

click_js() {
  ab eval "(() => { const el = $1; if (!el) throw new Error('not found: ' + $(json_string "$1")); el.click(); return true })()" >/dev/null
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

# ── Header: one row of the mark, app switcher and icons ─────────────────────
[[ "$(js "document.querySelector('.header').classList.contains('compact')")" == "true" ]] || fail "header isn't compact at 390px"
[[ "$(visible '.header .app-switcher')" == "true" ]] || fail "the app switcher should stay in the header"
[[ "$(js "Math.round(document.querySelector('.header').getBoundingClientRect().height)")" == "40" ]] || fail "the header should be one 40px row"
for name in "Switch to dark theme|Switch to light theme" About Settings; do
  found="$(js "[...document.querySelectorAll('.header .header-icon-btn')].some(el => el.getClientRects().length && /^($name)\$/.test(el.getAttribute('aria-label')))")"
  [[ "$found" == "true" ]] || fail "header lacks a visible $name button"
done
[[ "$(visible '.header a[aria-label=\"Source code on GitHub\"]')" == "false" ]] || fail "GitHub belongs in About on phones"
[[ "$(js "document.querySelector('.header-title').getBoundingClientRect().width <= 1")" == "true" ]] || fail "the mark stands in for the title on phones"
[[ "$(js "document.querySelector('h1')?.textContent.trim()")" == '"Agda Playground"' ]] || fail "the title should still be the page's <h1>"
echo "PASS: compact header: mark, app switcher and icons on one row"

# ── Commands opens under its toggle, across the screen ───────────────────────
click_js "document.querySelector('.commands-menu-toggle')"
menu_top="$(js "Math.round(document.querySelector('#commands-menu').getBoundingClientRect().top)")"
toggle_bottom="$(js "Math.round(document.querySelector('.commands-menu-toggle').getBoundingClientRect().bottom)")"
(( menu_top >= toggle_bottom && menu_top <= toggle_bottom + 12 )) || fail "Commands menu should open just under its toggle ($toggle_bottom -> $menu_top)"
ab press Escape >/dev/null
ab wait 200 >/dev/null
echo "PASS: the Commands menu opens just under its toggle"

# ── Editor over the panel; Goals / Messages switch; status ──────────────────
set_editor_fixture "test-fixtures/agda/query-goal.agda" "{! n !}" 4 >/dev/null
load_agda >/dev/null
ab wait 1200 >/dev/null
[[ "$(visible '.cm-content')" == "true" && "$(visible '.goals-section')" == "true" ]] || fail "editor and Goals should both show"
[[ "$(visible '.messages-panel')" == "false" ]] || fail "Messages should wait behind the switch"
[[ "$(visible '.goals-header')" == "false" ]] || fail "the bar's switch replaces Goals' own header on phones"
[[ "$(shown_panel)" == "Goals" ]] || fail "panel should start on Goals"
assert_active_goal_contains "?0 : N" "the active goal shows under the editor"
click_js "[...document.querySelectorAll('.mobile-switch button')].find(b => b.textContent.includes('Messages'))"
[[ "$(visible '.messages-panel')" == "true" && "$(visible '.goals-section')" == "false" ]] || fail "Messages switch didn't swap the panel"
assert_log_contains "Load finished." "the log kept everything while hidden"
[[ "$(visible '.agda-status')" == "false" ]] || fail "status should be behind its dot"
click_js "document.querySelector('.mobile-status-btn')"
[[ "$(visible '.agda-status')" == "true" && "$(visible '.agda-env-toggle')" == "true" ]] || fail "the status dot didn't open status and environment"
click_js "document.querySelector('.mobile-status-btn')"
click_js "[...document.querySelectorAll('.mobile-switch button')].find(b => b.textContent.includes('Goals'))"
echo "PASS: editor over the panel, Goals / Messages switch, status behind the dot"

# ── Collapse to the summary bar and back ─────────────────────────────────────
editor_before="$(js "Math.round(document.querySelector('.cm-editor').getBoundingClientRect().height)")"
click_js "document.querySelector('.mobile-collapse-btn')"
[[ "$(visible '.goals-section')" == "false" ]] || fail "collapsing didn't hide Goals"
summary="$(js "document.querySelector('.mobile-summary')?.textContent.trim() ?? ''")"
[[ "$summary" == '"?0 : N"' ]] || fail "collapsed summary should name the current goal, got $summary"
editor_after="$(js "Math.round(document.querySelector('.cm-editor').getBoundingClientRect().height)")"
(( editor_after > editor_before + 150 )) || fail "the editor didn't take the room ($editor_before -> $editor_after px)"
click_js "document.querySelector('.mobile-summary')"
[[ "$(visible '.goals-section')" == "true" ]] || fail "tapping the summary didn't expand the panel"
echo "PASS: the panel collapses to a one-line summary and the editor takes the room"

# ── A prompt opens Goals (even when collapsed); a result opens Messages ──────
# A file without goals, so Search about asks for its input (with exactly one
# goal, that goal's content would be used from anywhere in the file).
set_editor_fixture "test-fixtures/agda/query-bool.agda" >/dev/null
load_agda >/dev/null
click_js "document.querySelector('.mobile-collapse-btn')"
ab eval "(() => { const v = document.querySelector('.cm-content').cmTile.view; v.dispatch({ selection: { anchor: 0 } }); v.focus(); return true })()" >/dev/null
press_agda_chord "z" "KeyZ" >/dev/null
ab wait 400 >/dev/null
[[ "$(visible '.goals-section')" == "true" && "$(shown_panel)" == "Goals" ]] || fail "a prompt didn't open the panel on Goals"
[[ "$(js "document.activeElement?.id ?? ''")" == '"command-input"' ]] || fail "the prompt's input isn't focused"
submit_command_prompt "Bool" >/dev/null
wait_for_log_contains "Search about finished." 30000
ab wait 300 >/dev/null
[[ "$(shown_panel)" == "Messages" ]] || fail "a query result didn't switch the panel to Messages (on: $(shown_panel))"
echo "PASS: prompts open Goals, results switch to Messages"

echo "PASS: mobile-layout"
