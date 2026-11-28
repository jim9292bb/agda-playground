#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression: with two tabs of one route, a save in tab B (its stale buffer,
# e.g. on Load) silently replaced tab A's newer saved work. Expected: when
# tab A saves, tab B -- which has no unsaved edits -- takes A's version, so
# nothing older is written back. Checked on / and /literate.

BASE_URL="${APP_URL%/}"
BASE_URL="${BASE_URL%/literate}"

tab_ids() {
  ab tab list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=(j.data?.tabs??j.tabs??[]);console.log(t.map(x=>x.tabId).join(" "))})'
}
close_extra_tabs() {
  local first=1 id
  for id in $(tab_ids); do
    if (( first )); then first=0; continue; fi
    ab tab close "$id" >/dev/null
  done
}
all_text() {
  ab eval "Array.from(document.querySelectorAll('.cm-content')).map(c => c.cmTile.view.state.doc.toString()).join('\n')"
}

# $1: route ('' or 'literate'), $2: selector the page is ready on
other_tab_save_is_adopted() {
  local route="$1" ready="$2" mark tab_a
  mark="-- TAB A WORK $route $RANDOM"
  close_extra_tabs
  tab_a="$(tab_ids | cut -d' ' -f1)"
  ab open "$BASE_URL/$route" >/dev/null
  wait_for_app_ready "$ready"
  ab eval "(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('agda-web-ide-beta:doc')) localStorage.removeItem(k); return true })()" >/dev/null
  ab reload >/dev/null
  wait_for_app_ready "$ready"

  ab tab new --label tabb "$BASE_URL/$route" >/dev/null
  wait_for_app_ready "$ready"

  # Tab A types work; it is saved shortly after.
  ab tab "$tab_a" >/dev/null
  ab eval "(() => {
    const v = (document.querySelector('.literate-cell-editor .cm-content') || document.querySelector('.cm-content')).cmTile.view
    v.dispatch({ changes: { from: v.state.doc.length, insert: '\n$mark\n' }, userEvent: 'input.type' })
    return true })()" >/dev/null
  ab wait 1500 >/dev/null

  # Tab B shows A's version without a reload.
  ab tab tabb >/dev/null
  ab wait 500 >/dev/null
  if [[ "$(all_text)" != *"$mark"* ]]; then
    echo "FAIL (/$route): tab B kept its stale buffer after tab A saved" >&2; exit 1
  fi
  assert_log_contains "another tab" "tab B says where the new version came from"

  # Reloading tab A still shows its work.
  ab tab "$tab_a" >/dev/null
  ab reload >/dev/null
  wait_for_app_ready "$ready"
  ab wait 500 >/dev/null
  if [[ "$(all_text)" != *"$mark"* ]]; then
    echo "FAIL (/$route): tab A's saved work was lost" >&2; exit 1
  fi
  ab tab close tabb >/dev/null || true
  echo "PASS (/$route): tab B takes tab A's newer save"
}

other_tab_save_is_adopted "" .cm-content
other_tab_save_is_adopted "literate" .literate-cell
