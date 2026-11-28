#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regression: Give in cell 2 makes the notebook re-load the prefix first
# (presync). Typing in cell 1 during that Load dropped its InteractionPoints,
# and Give then filled cell 1's goal. Expected: cell 2's goal is filled.

EDIT_DELAY_MS=300

CELL0='data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
z + b = b
s a + b = s (a + b)

_*_ : N -> N -> N
z * b = z
s a * b = b + (a * b)

ten : N
ten = s (s (s (s (s (s (s (s (s (s z)))))))))

data _==_ {A : Set} (x : A) : A -> Set where
  refl : x == x

r : N
r = {! s z !}'
# slow = refl makes the prefix-2 load take ~1.4 s (normalises 10^4).
CELL1='slow : (ten * (ten * (ten * ten))) == ((ten * ten) * (ten * ten))
slow = refl

q : N
q = {! z !}'

cells_json() { ab eval "JSON.stringify(Array.from(document.querySelectorAll('.literate-cell-editor .cm-content')).map(e => e.cmTile.view.state.doc.toString()))"; }

run_sequence() {   # $1 = 1 to type in cell 1 during the presync load
  literate_open_app >/dev/null
  start_als >/dev/null
  set_cell_content 0 "$CELL0" >/dev/null
  click_toolbar_button "+ Code" >/dev/null
  set_cell_content 1 "$CELL1" >/dev/null
  # Load from cell 1: only cell 1's goal ?0 is registered.
  press_agda_chord_in_cell 0 l KeyL >/dev/null
  wait_for_log_contains "Load finished." 60000
  ab eval "(() => {
    const els = document.querySelectorAll('.literate-cell-editor .cm-content')
    const v0 = els[0].cmTile.view, v1 = els[1].cmTile.view, t = els[1]
    const orig = console.log; window.__fired = 0; window.__give = ''; window.__edited = 0
    console.log = function (...a) {
      try {
        if (a[0] === '<--') {
          const s = JSON.parse(JSON.stringify(a[1] ?? '')); const str = JSON.stringify(s)
          if (str.includes('Cmd_give')) window.__give = str.slice(str.indexOf('Cmd_give'), str.indexOf('Cmd_give') + 40) + ' ... ' + str.slice(str.lastIndexOf(')') + 1, str.lastIndexOf(')') + 12)
          if (!window.__fired && str.includes('Cmd_load')) {
            window.__fired = 1
            if ($1) setTimeout(() => { v0.dispatch({ changes: { from: v0.state.doc.length, insert: '\n-- x' } }); window.__edited = 1 }, $EDIT_DELAY_MS)
          }
        }
      } catch {}
      return orig.apply(this, a)
    }
    // Click into cell 2's goal and press C-c C-SPC (Give).
    v1.focus()
    v1.dispatch({ selection: { anchor: v1.state.doc.toString().indexOf('{! z') + 3 } })
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true, cancelable: true }))
    t.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true, cancelable: true }))
    return true
  })()" >/dev/null
  wait_for_log_matches "Give (failed|finished)" 30000
  ab wait 500 >/dev/null
}

run_sequence 1
cells="$(cells_json)"
[[ "$(ab eval 'window.__edited' | tail -n1)" == 1 ]] || { echo "FAIL: the edit during the presync Load was never made" >&2; exit 1; }
if [[ "$cells" != *'q = z'* || "$cells" != *'r = {! s z !}'* ]]; then
  echo "FAIL: Give in cell 2 typed over during the presync Load did not fill cell 2's goal: $cells / $(log_text)" >&2; exit 1
fi
assert_log_contains "Give finished." "the Give finishes"
echo "PASS: Give acts on its own cell's goal after an edit during the presync Load"
