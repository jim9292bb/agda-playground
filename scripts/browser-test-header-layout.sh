#!/usr/bin/env bash
set -euo pipefail

# The two rows above the editor must stay usable at every width: the global
# header (mark and title, app switcher, theme / GitHub / About / Settings
# icons) and the editor panel's head (picker, Commands, Copy / Open / Export,
# + Markdown / + Code in notebooks). On a phone (390px) their items used to
# overlap and run off-screen. Also checks the editor head's buttons, the
# theme toggle, and that the UI uses a sans-serif font -- no font-family was
# set, so buttons, panel headings and notebook prose fell back to the
# browser's default serif.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

BASE_URL="${APP_URL%/}"
BASE_URL="${BASE_URL%/literate}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Prints overlapping or off-screen items in either row, one per line;
# nothing if both lay out cleanly.
header_problems() {
  ab eval "(() => {
    const rows = [['.header', '.header-spacer', '.header-actions'], ['.editor-head', '.editor-head-spacer', '.editor-actions']]
    const name = el => (el.getAttribute('aria-label') || el.textContent).trim().replace(/\\s+/g, ' ').slice(0, 24)
    const problems = []
    for (const [rowSel, spacer, group] of rows) {
      const row = document.querySelector(rowSel)
      if (!row) { problems.push('missing: ' + rowSel); continue }
      const items = [...row.querySelectorAll(':scope > *:not(' + spacer + '):not(' + group + '), ' + group + ' > *')]
        .filter(el => el.getClientRects().length > 0)
      const rects = items.map(el => [el, el.getBoundingClientRect()])
      for (const [el, r] of rects) {
        if (r.right > innerWidth + 1 || r.left < -1) problems.push('off-screen: ' + name(el))
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const [a, ra] = rects[i], [b, rb] = rects[j]
          if (a.contains(b) || b.contains(a)) continue
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
          if (w > 1 && h > 1) problems.push('overlap: ' + name(a) + ' / ' + name(b))
        }
      }
    }
    return problems.join('\\n')
  })()" | tail -n 1 | tr -d '"'
}

# Prints the first family in `selector`'s computed font-family.
first_font_family() {
  local selector_json
  selector_json="$(json_string "$1")"
  ab eval "(() => {
    const el = document.querySelector($selector_json)
    if (!el) throw new Error('not found: ' + $selector_json)
    return getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/[\"']/g, '')
  })()" | tail -n 1 | tr -d '"'
}

check_header() {
  local route="$1" width="$2" problems
  ab set viewport "$width" 844 >/dev/null
  ab wait 500 >/dev/null
  problems="$(header_problems)"
  [[ -z "$problems" ]] || fail "$route at ${width}px: $problems"
  echo "PASS: $route at ${width}px: header and editor-head items neither overlap nor leave the screen"
}

check_sans() {
  local route="$1" selector="$2" family
  family="$(first_font_family "$selector")"
  [[ "$family" == "Inter" ]] || fail "$route: $selector uses '$family', not the UI sans-serif stack (Inter first)"
  echo "PASS: $route: $selector uses the UI sans-serif font"
}

# The editor head's buttons, as visible at the current width ("..." when
# they're in the More actions menu).
editor_actions() {
  ab eval "[...document.querySelectorAll('.editor-actions .editor-action')].filter(el => el.getClientRects().length).map(el => el.getAttribute('aria-label')).join(',')" | tail -n 1 | tr -d '"'
}

check_actions() {
  local route="$1" width="$2" expected="$3" actual
  ab set viewport "$width" 844 >/dev/null
  ab wait 400 >/dev/null
  actual="$(editor_actions)"
  [[ "$actual" == "$expected" ]] || fail "$route at ${width}px: editor head shows [$actual], expected [$expected]"
  echo "PASS: $route at ${width}px: editor head shows $expected"
}

# The "More actions" menu lists what the row can't show.
check_overflow_menu() {
  local route="$1" expected="$2" actual
  ab eval "(() => { document.querySelector('.editor-overflow-toggle').click(); return true })()" >/dev/null
  ab wait 300 >/dev/null
  actual="$(ab eval "[...document.querySelectorAll('#editor-overflow-menu [role=menuitem]')].filter(el => el.getClientRects().length).map(el => el.textContent.trim()).join(',')" | tail -n 1 | tr -d '"')"
  [[ "$actual" == "$expected" ]] || fail "$route: More actions lists [$actual], expected [$expected]"
  [[ "$(ab eval "document.activeElement?.getAttribute('role') ?? ''" | tail -n 1)" == '"menuitem"' ]] || fail "$route: More actions didn't focus its first item"
  ab press Escape >/dev/null
  ab wait 200 >/dev/null
  [[ "$(ab eval "Boolean(document.querySelector('#editor-overflow-menu'))" | tail -n 1)" == "false" ]] || fail "$route: Escape didn't close More actions"
  [[ "$(ab eval "document.activeElement?.classList.contains('editor-overflow-toggle') ?? false" | tail -n 1)" == "true" ]] || fail "$route: Escape didn't refocus the More actions toggle"
  echo "PASS: $route: More actions lists $expected; Escape closes it"
}

APP_URL="$BASE_URL/"
open_app
for width in 390 540 1024 1400; do check_header "/" "$width"; done
check_actions "/" 1400 "Copy,Open,Export"
check_actions "/" 390 "More actions"
check_overflow_menu "/" "Copy,Open,Export"
ab set viewport 1280 720 >/dev/null
check_sans "/" ".editor-action"
check_sans "/" ".messages-panel"

# The theme toggle forces the opposite of what's showing, and Settings can
# put it back to following the system.
before="$(ab eval "document.documentElement.dataset.theme ?? ''" | tail -n 1 | tr -d '"')"
ab eval "(() => { document.querySelector('.header-theme-btn').click(); return true })()" >/dev/null
ab wait 200 >/dev/null
after="$(ab eval "document.documentElement.dataset.theme ?? ''" | tail -n 1 | tr -d '"')"
[[ "$after" == "dark" || "$after" == "light" ]] || fail "theme toggle didn't force a theme (data-theme: '$after')"
[[ "$after" != "$before" ]] || fail "theme toggle didn't change the theme"
label="$(ab eval "document.querySelector('.header-theme-btn').getAttribute('aria-label')" | tail -n 1 | tr -d '"')"
[[ "$label" == "Switch to $([[ "$after" == dark ]] && echo light || echo dark) theme" ]] || fail "theme toggle's label didn't follow: $label"
ab eval "(() => { document.querySelector('.header-theme-btn').click(); localStorage.removeItem('agda-playground.appearance.v1'); return true })()" >/dev/null
echo "PASS: /: the theme toggle switches light / dark and relabels itself"

ab open "$BASE_URL/literate" >/dev/null
wait_for_app_ready .literate-cell
for width in 390 540 1024 1400; do check_header "/literate" "$width"; done
check_actions "/literate" 1400 "+ Markdown,+ Code,Open,Export"
check_actions "/literate" 700 "Open,Export,More actions"
check_overflow_menu "/literate" "+ Markdown,+ Code"
check_actions "/literate" 390 "More actions"
ab set viewport 1280 720 >/dev/null
check_sans "/literate" ".literate-markdown-content"

ab set viewport 1280 720 >/dev/null
echo "PASS: header-layout"
