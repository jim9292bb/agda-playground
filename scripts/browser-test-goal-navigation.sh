#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# C-c C-f / C-c C-b (Next goal / Previous goal) -- these are browser-side
# cursor navigation only (no Agda command involved: `focusAdjacentGoal` in
# +page.svelte just moves the cursor to the next/previous tracked goal by
# outerFrom order and wraps around at the ends). Previously untested on
# either the als-demo or agda-mode-vscode side (see
# docs/AGDA_MODE_VSCODE_MAPPING.md's Test Coverage by Command table).

open_app
start_als

load_and_wait() {
  click_button Load
  ab wait 1000 >/dev/null
  wait_for_log_contains "Load finished." 30000
}

set_editor_fixture "test-fixtures/agda/three-goals.agda"
load_and_wait

# Asserts the cursor currently sits inside the Nth {! !} hole (0-based, in
# document order).
assert_cursor_in_hole() {
  local expected="$1" label="$2"
  ab eval "(() => {
    const expected = $expected
    const view = document.querySelector('.cm-content')?.cmTile?.view
    const doc = view.state.doc.toString()
    const head = view.state.selection.main.head
    const holes = []
    let searchFrom = 0
    while (searchFrom < doc.length) {
      const from = doc.indexOf('{!', searchFrom)
      if (from < 0) break
      const close = doc.indexOf('!}', from + 2) + 2
      holes.push({ from, close })
      searchFrom = close
    }
    const index = holes.findIndex(h => h.from <= head && head <= h.close)
    if (index !== expected) {
      throw new Error('Expected cursor in hole ' + expected + ' but found it in hole ' + index + ' (head=' + head + ')')
    }
    return { ok: true, index, head }
  })()"
  echo "PASS $label"
}

# Cursor starts at document position 0 (not inside any goal). Next goal from
# there should land in the first goal (a).
press_agda_chord "f" "KeyF"
ab wait 300 >/dev/null
assert_cursor_in_hole 0 "Next goal from document start lands on the first goal (a)"

press_agda_chord "f" "KeyF"
ab wait 300 >/dev/null
assert_cursor_in_hole 1 "Next goal advances to the second goal (b)"

press_agda_chord "f" "KeyF"
ab wait 300 >/dev/null
assert_cursor_in_hole 2 "Next goal advances to the third goal (c)"

press_agda_chord "f" "KeyF"
ab wait 300 >/dev/null
assert_cursor_in_hole 0 "Next goal wraps around from the last goal back to the first (a)"

press_agda_chord "b" "KeyB"
ab wait 300 >/dev/null
assert_cursor_in_hole 2 "Previous goal wraps backward from the first goal to the last (c)"

press_agda_chord "b" "KeyB"
ab wait 300 >/dev/null
assert_cursor_in_hole 1 "Previous goal steps back to the second goal (b)"

echo "browser-test-goal-navigation: PASS"
