#!/usr/bin/env bash
set -euo pipefail

# Light/dark appearance: by default the app follows the OS (emulated here
# with agent-browser's --color-scheme); Settings > Appearance can force light
# or dark, which persists across reloads and is applied before first paint.
# In each case both the page (CSS, via color-scheme/light-dark()) and the
# editor (CodeMirror's dark base theme + the Agda highlighting palette,
# switched by autoColorScheme) must agree -- before this, the OS dark setting
# switched only the Agda palette, drawing light-on-dark colors on the
# editor's still-white background.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

STORAGE_KEY='agda-playground.appearance.v1'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Prints "dark" or "light" for the page background, the editor background,
# and an Agda keyword's color (dark palette keywords are light orange),
# e.g. "page=dark editor=dark keyword=dark".
scheme_state() {
  ab eval "(() => {
    const lum = color => {
      const [r, g, b] = color.match(/[0-9.]+/g).map(Number)
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }
    const page = getComputedStyle(document.querySelector('main')).backgroundColor
    const editor = getComputedStyle(document.querySelector('.cm-editor')).backgroundColor
    const keyword = document.querySelector('.agda-keyword')
    const keywordColor = keyword ? getComputedStyle(keyword).color : null
    return 'page=' + (lum(page) < 0.5 ? 'dark' : 'light')
      + ' editor=' + (lum(editor) < 0.5 ? 'dark' : 'light')
      + ' keyword=' + (keywordColor ? (lum(keywordColor) > 0.55 ? 'dark' : 'light') : 'none')
  })()" | tail -n 1 | tr -d '"'
}

expect_scheme() {
  local expected="$1" description="$2" state
  state="$(scheme_state)"
  [[ "$state" == "page=$expected editor=$expected keyword=$expected" ]] || fail "$description: $state"
  echo "PASS: $description ($state)"
}

# Opens the app under an emulated OS color scheme and loads a fixture so the
# editor has Agda highlighting to check.
open_under() {
  ab close >/dev/null 2>&1 || true
  ab --color-scheme "$1" open "$APP_URL" >/dev/null
  wait_for_app_ready
  start_als
  set_editor_fixture "test-fixtures/agda/normalization.agda" >/dev/null
  load_agda >/dev/null
}

set_appearance() {
  ab eval "(() => {
    const settings = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label') || b.textContent).trim() === 'Settings')
    settings.click()
    return true
  })()" >/dev/null
  ab wait 300 >/dev/null
  ab eval "(() => {
    const select = Array.from(document.querySelectorAll('.settings-field')).find(f => f.textContent.includes('Appearance'))?.querySelector('select')
    if (!select) throw new Error('Appearance select not found')
    select.value = '$1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    document.querySelector('.settings-close-button').click()
    return true
  })()" >/dev/null
  ab wait 300 >/dev/null
}

cleanup() {
  ab eval "(() => { localStorage.removeItem('$STORAGE_KEY'); return true })()" >/dev/null 2>&1 || true
  ab close >/dev/null 2>&1 || true
}
trap cleanup EXIT

open_under light
ab eval "(() => { localStorage.removeItem('$STORAGE_KEY'); return true })()" >/dev/null
ab reload >/dev/null; wait_for_app_ready; start_als
set_editor_fixture "test-fixtures/agda/normalization.agda" >/dev/null; load_agda >/dev/null
expect_scheme light "follows a light OS by default"

open_under dark
expect_scheme dark "follows a dark OS by default"

# Forcing light under a dark OS switches the page and the editor live.
set_appearance light
expect_scheme light "Settings > Appearance > Light overrides a dark OS"
[[ "$(ab eval "document.documentElement.dataset.theme ?? ''" | tail -n 1)" == '"light"' ]] || fail "data-theme not set to light"

# ...and persists, applied before first paint by app.html's inline script:
# data-theme is already there by the time the app's own scripts can run.
ab reload >/dev/null
ab wait .cm-content >/dev/null
[[ "$(ab eval "document.documentElement.dataset.theme ?? ''" | tail -n 1)" == '"light"' ]] || fail "forced appearance didn't survive a reload"
start_als
set_editor_fixture "test-fixtures/agda/normalization.agda" >/dev/null; load_agda >/dev/null
expect_scheme light "forced Light persists across a reload"

# Forcing dark under a light OS.
open_under light
set_appearance dark
expect_scheme dark "Settings > Appearance > Dark overrides a light OS"

# Back to following the system.
set_appearance system
[[ "$(ab eval "document.documentElement.dataset.theme ?? ''" | tail -n 1)" == '""' ]] || fail "data-theme not cleared for Match system"
[[ "$(ab eval "localStorage.getItem('$STORAGE_KEY')" | tail -n 1)" == "null" ]] || fail "Match system left a stored preference"
expect_scheme light "Match system follows the light OS again"

echo "PASS: appearance"
