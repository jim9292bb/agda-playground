#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# The C-u prefix (agda-mode-vscode's normalization variants): C-u presses
# before a shortcut pick its normalization for that one run only. The
# fixture's goal type `T (idN (idN z))` only reduces under Normalised
# (C-u C-u) -- Simplified, Instantiated and HeadNormal all leave it as
# written (verified against the running ALS before writing these asserts).

open_app
start_als

set_editor_fixture "test-fixtures/agda/normalization.agda" "?" 0
click_button Load
ab wait 1000 >/dev/null
wait_for_log_contains "Load finished." 30000

# Presses Ctrl-u on the editor; fails unless the app consumed it (which also
# keeps it from the browser's view-source and CodeMirror's Mod-u).
press_universal_argument() {
  ab eval "(() => {
    const el = document.querySelector('.cm-content')
    const event = new KeyboardEvent('keydown', { key: 'u', code: 'KeyU', ctrlKey: true, bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error('Ctrl-u was not consumed')
    return { ok: true }
  })()" >/dev/null
}

assert_chord_hint() {
  local expected_json
  expected_json="$(json_string "$1")"
  ab eval "(() => {
    const expected = $expected_json
    const hint = document.querySelector('.chord-hint')?.textContent.trim() ?? ''
    if (hint !== expected) throw new Error('Chord hint is ' + JSON.stringify(hint) + ', expected ' + JSON.stringify(expected))
    return { ok: true }
  })()" >/dev/null
  echo "PASS chord hint: ${1:-(none)}"
}

# Most recent query result (the Queries tab lists newest first).
assert_latest_query() {
  local expected_json
  expected_json="$(json_string "$1")"
  ab eval "(() => {
    const expected = $expected_json
    const latest = (document.querySelector('.messages-panel')?.dataset.queryResults ?? '').split('\n---\n')[0]
    if (latest !== expected) throw new Error('Latest query is ' + JSON.stringify(latest) + ', expected ' + JSON.stringify(expected))
    return { ok: true }
  })()" >/dev/null
  echo "PASS latest query: $2"
}

goal_type_with_prefix() {
  local count="$1"
  cursor_in_goal 0 >/dev/null
  for ((i = 0; i < count; i++)); do press_universal_argument; done
  press_agda_chord "t" "KeyT" >/dev/null
  ab wait 2000 >/dev/null
}

# ── Default (no prefix) ──────────────────────────────────────────────────────
goal_type_with_prefix 0
assert_latest_query "T (idN (idN z))" "default Goal type keeps the type as written"
assert_log_contains "Goal type finished." "default label has no variant suffix"

# ── C-u C-u → Normalised ─────────────────────────────────────────────────────
cursor_in_goal 0 >/dev/null
press_universal_argument
press_universal_argument
ab wait 200 >/dev/null
assert_chord_hint "C-u C-u"
press_agda_chord "t" "KeyT" >/dev/null
ab wait 2000 >/dev/null
assert_chord_hint ""
assert_latest_query "T z" "C-u C-u Goal type is fully normalised"
assert_log_contains "Goal type [Normalised] finished." "label names the Normalised variant"

# ── C-u → Instantiated (label only: same output as Simplified here) ─────────
goal_type_with_prefix 1
assert_log_contains "Goal type [Instantiated] finished." "one C-u selects Instantiated"

# ── The prefix applies to one run only ───────────────────────────────────────
count_plain_goal_type_runs() {
  ab eval "(() => (document.querySelector('.messages-panel')?.dataset.logContent ?? '').split('\\n').filter(line => line === 'Goal type finished.').length)()"
}
before="$(count_plain_goal_type_runs)"
goal_type_with_prefix 0
assert_latest_query "T (idN (idN z))" "the next unprefixed Goal type is back to the default"
after="$(count_plain_goal_type_runs)"
if (( after != before + 1 )); then
  echo "Expected one more unsuffixed 'Goal type finished.' line ($before -> $after)" >&2
  exit 1
fi
echo "PASS prefix does not stick to later commands"

# ── A non-chord key after C-u drops the prefix ───────────────────────────────
cursor_in_goal 0 >/dev/null
press_universal_argument
ab eval "(() => {
  const el = document.querySelector('.cm-content')
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
  return { ok: true }
})()" >/dev/null
ab wait 200 >/dev/null
assert_chord_hint ""
goal_type_with_prefix 0
assert_latest_query "T (idN (idN z))" "an abandoned C-u does not leak into the next shortcut"

echo "browser-test-normalization-prefix: PASS"
