#!/usr/bin/env bash
set -euo pipefail

# Accessibility basics that an axe scan flagged or that only show up under
# real keyboard use: the page's language, heading and main landmark, the
# editors' accessible names, the first Tab stop, and the About / Settings
# dialogs' focus handling (focus moves in, Tab stays in, Escape closes,
# focus returns). Uses real key presses (`ab press`).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

BASE_URL="${APP_URL%/}"
BASE_URL="${BASE_URL%/literate}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

js() {
  ab eval "$1" | tail -n 1
}

# Describes the focused element by its accessible name or text.
focused() {
  js "(() => {
    const e = document.activeElement
    if (!e || e === document.body) return 'body'
    return (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  })()" | tr -d '"'
}

focus_in_dialog() {
  js "(() => Boolean(document.activeElement?.closest('[role=dialog]')))()"
}

click_named_button() {
  local name_json
  name_json="$(json_string "$1")"
  ab eval "(() => {
    const name = $name_json
    const button = Array.from(document.querySelectorAll('button'))
      .find(b => (b.getAttribute('aria-label') || b.textContent).trim() === name)
    if (!button) throw new Error('button not found: ' + name)
    button.focus()
    button.click()
    return true
  })()" >/dev/null
}

APP_URL="$BASE_URL/"
open_app

[[ "$(js "document.documentElement.lang")" == '"en"' ]] || fail "<html> has no lang=\"en\""
[[ "$(js "document.querySelector('h1')?.textContent.trim() ?? ''")" == '"Agda Playground"' ]] || fail "no <h1>Agda Playground</h1>"
[[ "$(js "document.querySelectorAll('main').length")" == "1" ]] || fail "expected exactly one <main>"
[[ "$(js "document.querySelector('.cm-content').getAttribute('aria-label')")" == '"Agda source"' ]] || fail "editor has no accessible name"
echo "PASS: /: lang, <h1>, <main> and the editor's accessible name"

ab eval "(() => { document.activeElement?.blur(); return true })()" >/dev/null
ab press Tab >/dev/null
[[ "$(js "document.activeElement?.type ?? ''")" != '"file"' ]] || fail "first Tab stops on the hidden file input"
echo "PASS: /: first Tab skips the hidden file input (lands on: $(focused))"

ab eval "(() => { document.querySelector('.commands-menu-toggle').click(); return true })()" >/dev/null
ab wait 300 >/dev/null
[[ "$(js "document.querySelector('.commands-panel-note')?.textContent ?? ''")" == *"press Esc, then Tab"* ]] \
  || fail "Commands menu doesn't explain how to leave the editor"
ab press Escape >/dev/null
ab wait 200 >/dev/null
echo "PASS: /: the Commands menu explains Esc, Tab to leave the editor"

# About: focus moves in, Tab cycles inside, Escape closes and refocuses the opener.
click_named_button "About"
ab wait 300 >/dev/null
[[ "$(focus_in_dialog)" == "true" ]] || fail "About: focus didn't move into the dialog"
for _ in 1 2 3 4 5; do ab press Tab >/dev/null; done
[[ "$(focus_in_dialog)" == "true" ]] || fail "About: Tab left the dialog"
ab press Shift+Tab >/dev/null
[[ "$(focus_in_dialog)" == "true" ]] || fail "About: Shift+Tab left the dialog"
ab press Escape >/dev/null
ab wait 300 >/dev/null
[[ "$(js "Boolean(document.querySelector('.about-panel'))")" == "false" ]] || fail "About: Escape didn't close it"
[[ "$(focused)" == "About" ]] || fail "About: focus didn't return to the About button (got: $(focused))"
echo "PASS: /: About dialog keeps focus inside, closes on Escape, refocuses its opener"

# Settings: same, except closing hands focus to the editor on purpose.
click_named_button "Settings"
ab wait 300 >/dev/null
[[ "$(focus_in_dialog)" == "true" ]] || fail "Settings: focus didn't move into the dialog"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do ab press Tab >/dev/null; done
[[ "$(focus_in_dialog)" == "true" ]] || fail "Settings: Tab left the dialog"
ab press Escape >/dev/null
ab wait 300 >/dev/null
[[ "$(js "Boolean(document.querySelector('.settings-panel'))")" == "false" ]] || fail "Settings: Escape didn't close it"
[[ "$(js "document.activeElement?.classList.contains('cm-content') ?? false")" == "true" ]] \
  || fail "Settings: closing didn't return focus to the editor (got: $(focused))"
echo "PASS: /: Settings dialog keeps focus inside, closes on Escape, refocuses the editor"

ab open "$BASE_URL/literate" >/dev/null
wait_for_app_ready .literate-cell
[[ "$(js "document.querySelector('h1')?.textContent.trim() ?? ''")" != '""' ]] || fail "/literate: no <h1>"
[[ "$(js "document.querySelectorAll('main').length")" == "1" ]] || fail "/literate: expected exactly one <main>"
[[ "$(js "document.querySelector('.literate-cell-code .cm-content')?.getAttribute('aria-label')")" == '"Agda code block"' ]] \
  || fail "/literate: code cell editor has no accessible name"
echo "PASS: /literate: <h1>, <main> and the code cells' accessible name"

echo "PASS: a11y-keyboard"
