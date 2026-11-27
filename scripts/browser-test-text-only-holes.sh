#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression: a `{! !}` that is only text -- restored by undo after a Give,
# pasted, or written in a comment -- is not an interaction point. Goal
# commands with the cursor there used to pair it with another goal's id and
# fill that goal instead. Expected: handled as outside a goal (Give asks for
# input in the Goals panel), other goals unchanged
# (agda-mode-vscode and Emacs act only on goals they track).

view_js="document.querySelector('.cm-content').cmTile.view"

refusals() { log_text | { grep -o 'Give: enter command input' || true; } | wc -l; }

# $1: text whose `{! z !}` gets the cursor, $2: label
give_in_text_hole_is_refused() {
  local needle_json label="$2" before
  needle_json="$(json_string "$1")"
  before="$(refusals)"
  ab eval "(() => { const v = $view_js; const d = v.state.doc.toString(); const at = d.indexOf($needle_json); v.dispatch({ selection: { anchor: d.indexOf('{! z !}', at) + 3 } }); v.focus(); return true })()" >/dev/null
  press_agda_chord " " "Space" >/dev/null
  for _ in $(seq 1 20); do
    (( $(refusals) > before )) && break
    ab wait 500 >/dev/null
  done
  if (( $(refusals) <= before )); then
    echo "FAIL ($label): Give in a text-only hole was not treated as outside a goal: $(editor_text) / $(log_text)" >&2; exit 1
  fi
  cancel_command_prompt >/dev/null
  assert_editor_contains 'b = {! s z !}' "$label: the real goal of b is unchanged"
}

open_app
start_als

# --- undo after Give ---
set_editor_fixture test-fixtures/agda/text-only-holes.agda "z !}" 0 >/dev/null
load_agda
press_agda_chord " " "Space" >/dev/null
wait_for_log_contains "Give finished." 30000
assert_editor_contains $'a = z\n' "first Give"
ab eval "(() => { $view_js.focus(); return true })()" >/dev/null
ab press Control+z >/dev/null
ab wait 500 >/dev/null
assert_editor_contains 'a = {! z !}' "undo restores the text of the hole"
give_in_text_hole_is_refused '{! z !}' "undo"

# --- pasted copy of a hole ---
ab eval "(() => { const v = $view_js; const n = v.state.doc.length; v.dispatch({ changes: { from: n, insert: '\nc : N\nc = {! z !}\n' }, userEvent: 'input.paste' }); return true })()" >/dev/null
give_in_text_hole_is_refused 'c = {! z !}' "paste"

# --- hole inside a comment ---
ab eval "(() => { const v = $view_js; v.dispatch({ changes: { from: 0, insert: '-- usage: d = {! z !}\n' } }); return true })()" >/dev/null
give_in_text_hole_is_refused 'usage: d = {! z !}' "comment"
