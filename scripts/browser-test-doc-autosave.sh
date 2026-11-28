#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression: Settings says "Editor contents are saved in this browser", but
# the buffer was saved only when an Agda command ran, so text typed and not
# loaded was gone after a reload. Expected: an edit survives a reload, both
# after a pause (scheduled save) and straight away (saved on pagehide).
# Checked on / and /literate (the notebook saves its hidden document).

BASE_URL="${APP_URL%/}"
BASE_URL="${BASE_URL%/literate}"

all_editor_text() {
  ab eval "Array.from(document.querySelectorAll('.cm-content')).map(c => c.cmTile.view.state.doc.toString()).join('\n')"
}

# $1: route ('' or 'literate'), $2: wait before reload in ms
typed_text_survives_reload() {
  local route="$1" pause="$2" mark ready=.cm-content
  [[ -n "$route" ]] && ready=.literate-cell
  mark="-- typed-not-loaded-$route-$pause-$RANDOM"
  ab open "$BASE_URL/$route" >/dev/null
  wait_for_app_ready "$ready"
  ab eval "(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('agda-web-ide-beta:doc')) localStorage.removeItem(k); return true })()" >/dev/null
  ab reload >/dev/null
  wait_for_app_ready "$ready"
  ab eval "(() => {
    const content = document.querySelector('.literate-cell-editor .cm-content') || document.querySelector('.cm-content')
    const view = content.cmTile.view
    view.focus()
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n$mark\n' }, userEvent: 'input.type' })
    return true })()" >/dev/null
  if (( pause > 0 )); then ab wait "$pause" >/dev/null; fi
  ab reload >/dev/null
  wait_for_app_ready "$ready"
  ab wait 1000 >/dev/null
  if [[ "$(all_editor_text)" != *"$mark"* ]]; then
    echo "FAIL (/$route, reload after ${pause}ms): typed text was lost" >&2; exit 1
  fi
  echo "PASS (/$route, reload after ${pause}ms): typed text restored"
}

typed_text_survives_reload "" 1500
typed_text_survives_reload "" 0
typed_text_survives_reload "literate" 1500
typed_text_survives_reload "literate" 0
