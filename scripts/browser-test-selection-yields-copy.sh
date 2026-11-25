#!/usr/bin/env bash
set -euo pipefail

# With text selected in an editor, Ctrl-c / Ctrl-x are the browser's copy /
# cut -- not the start of an Agda chord (Ctrl-c Ctrl-l, Ctrl-x =, ...).
# agda-mode-vscode gates every one of its chord keybindings on
# `!editorHasSelection` for the same reason. Before this, the chord handler
# preventDefault()ed the leading Ctrl-c / Ctrl-x unconditionally, so copy and
# cut never happened in the editor. Without a selection, chords still work.
#
# Uses real key presses (`ab press`, CDP Input.dispatchKeyEvent), not
# synthetic KeyboardEvents: only a real keypress triggers the browser's own
# copy/cut, which is exactly what's under test. Covers both the single-buffer
# `/` route and the notebook (/literate), whose chord handlers are separate.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

BASE_URL="${APP_URL%/}"
BASE_URL="${BASE_URL%/literate}"

SOURCE=$'data N : Set where\n  z : N\n'
SELECTED='data N'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Sets editor `selector`'s content to $SOURCE, selects $SELECTED (or nothing
# when $2 is "none"), focuses it, and resets the copy/cut counters.
prepare_editor() {
  local selector_json source_json selected_json
  selector_json="$(json_string "$1")"
  source_json="$(json_string "$SOURCE")"
  selected_json="$(json_string "$SELECTED")"
  ab eval "(() => {
    const view = document.querySelector($selector_json)?.cmTile?.view
    if (!view) throw new Error('editor not found: ' + $selector_json)
    const source = $source_json
    const from = source.indexOf($selected_json)
    const to = '$2' === 'none' ? from : from + $selected_json.length
    window.__agdaTestBypassFenceGuard = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
      selection: { anchor: from, head: to },
    })
    view.focus()
    if (!window.__selectionTestListeners) {
      window.__selectionTestListeners = true
      document.addEventListener('copy', () => window.__copyEvents++, true)
      document.addEventListener('cut', () => window.__cutEvents++, true)
    }
    window.__copyEvents = 0
    window.__cutEvents = 0
    return { ok: true }
  })()" >/dev/null
}

counter() {
  ab eval "(() => window.$1)()" | tail -n 1 | tr -cd '0-9'
}

chord_hint_visible() {
  ab eval "(() => Boolean(document.querySelector('.chord-hint')?.textContent.trim()))()" | tail -n 1
}

editor_doc() {
  local selector_json
  selector_json="$(json_string "$1")"
  ab eval "(() => document.querySelector($selector_json).cmTile.view.state.doc.toString())()" | tail -n 1
}

check_route() {
  local route="$1" selector="$2"

  prepare_editor "$selector" selected
  ab press Control+c >/dev/null
  ab wait 200 >/dev/null
  [[ "$(counter __copyEvents)" == "1" ]] || fail "$route: Ctrl-c with a selection did not copy"
  [[ "$(chord_hint_visible)" == "false" ]] || fail "$route: Ctrl-c with a selection started an Agda chord"
  echo "PASS: $route: Ctrl-c with a selection copies instead of starting a chord"

  prepare_editor "$selector" selected
  ab press Control+x >/dev/null
  ab wait 200 >/dev/null
  [[ "$(counter __cutEvents)" == "1" ]] || fail "$route: Ctrl-x with a selection did not cut"
  [[ "$(chord_hint_visible)" == "false" ]] || fail "$route: Ctrl-x with a selection started an Agda chord"
  [[ "$(editor_doc "$selector")" != *"$SELECTED"* ]] || fail "$route: Ctrl-x with a selection left the selected text in place"
  echo "PASS: $route: Ctrl-x with a selection cuts instead of starting a chord"

  # No selection: the same leading key still starts a chord, and a full
  # chord still runs its Agda command.
  prepare_editor "$selector" none
  ab press Control+c >/dev/null
  ab wait 200 >/dev/null
  [[ "$(chord_hint_visible)" == "true" ]] || fail "$route: Ctrl-c without a selection did not start a chord"
  [[ "$(counter __copyEvents)" == "0" ]] || fail "$route: Ctrl-c without a selection copied"
  ab press Control+l >/dev/null
  wait_for_log_contains "Load finished." 30000
  echo "PASS: $route: without a selection, Ctrl-c Ctrl-l still loads"
}

APP_URL="$BASE_URL/"
open_app
start_als
check_route "/" ".cm-content"

ab open "$BASE_URL/literate" >/dev/null
wait_for_app_ready .literate-cell
reset_storage_and_reload .literate-cell \
  'agda-playground-literate.shortcut-overrides.v1' \
  'agda-web-ide-beta:doc:source.lagda.md'
start_als
check_route "/literate" ".literate-cell-editor .cm-content"

echo "PASS: selection-yields-copy"
