#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Notebook counterpart of test:browser:normalization-prefix: /literate has
# its own chord handler (NotebookPage.svelte's handleAgdaChordKeydown), so
# the C-u prefix is covered there separately.

literate_open_app
start_als

set_cell_content 0 "$(cat "$ROOT_DIR/test-fixtures/agda/normalization.agda")" >/dev/null
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 30000

# Places the cursor in cell 0's goal, presses Ctrl-u `count` times and then
# C-c C-t, all on that cell's own editor.
goal_type_in_cell_with_prefix() {
  local count="$1"
  cursor_in_cell_goal 0 0 >/dev/null
  ab eval "(() => {
    const el = document.querySelectorAll('.literate-cell-editor .cm-content')[0]
    for (let i = 0; i < $count; i++) {
      const event = new KeyboardEvent('keydown', { key: 'u', code: 'KeyU', ctrlKey: true, bubbles: true, cancelable: true })
      el.dispatchEvent(event)
      if (!event.defaultPrevented) throw new Error('Ctrl-u was not consumed')
    }
    return { ok: true }
  })()" >/dev/null
  press_agda_chord_in_cell 0 "t" "KeyT" >/dev/null
  ab wait 2000 >/dev/null
}

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

goal_type_in_cell_with_prefix 0
assert_latest_query "T (idN (idN z))" "default Goal type keeps the type as written"

goal_type_in_cell_with_prefix 2
assert_latest_query "T z" "C-u C-u Goal type is fully normalised"
assert_log_contains "Goal type [Normalised] finished." "label names the Normalised variant"

goal_type_in_cell_with_prefix 0
assert_latest_query "T (idN (idN z))" "the prefix applies to one run only"

echo "browser-test-literate-normalization-prefix: PASS"
