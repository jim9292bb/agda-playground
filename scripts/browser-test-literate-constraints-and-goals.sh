#!/usr/bin/env bash
# Notebook counterpart of test:browser:constraints-and-goals: Show
# constraints (C-c C-=) and Show goals (C-c C-?) from a cell's own editor.
# Also checks that both chords consume their second key -- Ctrl-= is the
# browser's zoom-in shortcut, so it must not reach the browser.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

literate_open_app
start_als

set_cell_content 0 "$(cat "$ROOT_DIR/test-fixtures/agda/constraints-solve.agda")" >/dev/null
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 30000

# C-c then Ctrl-<key> on cell 0's editor; fails unless the chord's second
# key was consumed (preventDefault), so the browser never sees it.
consumed_chord_in_cell() {
  local key_json
  key_json="$(json_string "$1")"
  ab eval "(() => {
    const el = document.querySelectorAll('.literate-cell-editor .cm-content')[0]
    el.cmTile.view.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true, cancelable: true }))
    const event = new KeyboardEvent('keydown', { key: $key_json, code: '$2', ctrlKey: true, bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error('Ctrl-' + $key_json + ' reached the browser')
    return { ok: true }
  })()" >/dev/null
}

consumed_chord_in_cell "=" "Equal"
wait_for_log_contains "Show constraints finished." 20000
latest_query="$(ab eval "(() => (document.querySelector('.messages-panel')?.dataset.queryResults ?? '').split('\n---\n')[0])()")"
for needle in '?0 := z' 'g _17 = z : N (blocked on _17, belongs to problem'; do
  if [[ "$latest_query" != *"$needle"* ]]; then
    echo "FAIL Show constraints result lacks $needle: $latest_query" >&2
    exit 1
  fi
done
echo "PASS Show constraints lists the cell's open constraints"

consumed_chord_in_cell "?" "Slash"
wait_for_log_contains "Show goals finished." 20000
assert_log_contains "_17 : N" "Show goals lists the unsolved meta"

echo "browser-test-literate-constraints-and-goals: PASS"
