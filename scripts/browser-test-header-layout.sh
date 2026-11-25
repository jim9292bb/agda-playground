#!/usr/bin/env bash
set -euo pipefail

# The header row must stay usable at every width: on a phone (390px) its
# title, pickers, app links and action buttons used to overlap each other and
# run off-screen, because the row never wrapped. Also checks that the UI uses
# a sans-serif font -- no font-family was set, so buttons, panel headings and
# notebook prose fell back to the browser's default serif.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

BASE_URL="${APP_URL%/}"
BASE_URL="${BASE_URL%/literate}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Prints overlapping or off-screen header items, one per line; nothing if the
# header lays out cleanly.
header_problems() {
  ab eval "(() => {
    const header = document.querySelector('.header')
    const items = [...header.querySelectorAll(':scope > *:not(.header-spacer):not(.header-actions), .header-actions > *')]
      .filter(el => el.getClientRects().length > 0)
    const name = el => (el.getAttribute('aria-label') || el.textContent).trim().replace(/\\s+/g, ' ').slice(0, 24)
    const problems = []
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
  echo "PASS: $route at ${width}px: header items neither overlap nor leave the screen"
}

check_sans() {
  local route="$1" selector="$2" family
  family="$(first_font_family "$selector")"
  [[ "$family" == "Inter" ]] || fail "$route: $selector uses '$family', not the UI sans-serif stack (Inter first)"
  echo "PASS: $route: $selector uses the UI sans-serif font"
}

APP_URL="$BASE_URL/"
open_app
for width in 390 540 1400; do check_header "/" "$width"; done
check_sans "/" ".header-action-btn"
check_sans "/" ".messages-panel"

ab open "$BASE_URL/literate" >/dev/null
wait_for_app_ready .literate-cell
for width in 390 540 1400; do check_header "/literate" "$width"; done
check_sans "/literate" ".literate-markdown-content"

ab set viewport 1280 720 >/dev/null
echo "PASS: header-layout"
