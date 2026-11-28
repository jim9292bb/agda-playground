#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regressions:
# - Give pressed in cell 2, then a click in cell 1 during the presync
#   re-load: the Give filled cell 1's goal. Expected: the goal the caret
#   was in at keypress (Emacs agda2-goal-cmd reads point then).
# - Deleting or inserting a cell above a loaded code cell dropped or
#   shifted its goal and highlight decorations (cells must be updated
#   before dispatching to hiddenView, CLAUDE.md).

failed=0

# --- click in another cell during the presync re-load ---
if ( set +e; 
# /literate: a goal command's target is resolved only *after* its presync
# re-load finishes (run-shortcut.js: getAgdaShortcutContext runs after
# `await presync(view)`), and the presync is a full Cmd_load of the prefix,
# which takes seconds. Press Give in cell 2's goal, then click into cell 1's
# goal while that re-load is running: the Give goes to cell 1's goal and
# uses cell 1's text. Cell 2's goal is not touched. Log: "Give finished."
# No typing is involved.
set +e
CLICK_DELAY_MS="${CLICK_DELAY_MS:-200}"

# slow = refl makes every load of cell 1 take ~1.2 s (normalises 10^4).
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

slow : (ten * (ten * (ten * ten))) == ((ten * ten) * (ten * ten))
slow = refl

r : N
r = {! s z !}'
CELL1='q : N
q = {! z !}'

cells_json() { ab eval "JSON.stringify(Array.from(document.querySelectorAll('.literate-cell-editor .cm-content')).map(e => e.cmTile.view.state.doc.toString()))"; }

run_sequence() {   # $1 = 1 to click into cell 1's goal during the presync
  literate_open_app >/dev/null
  start_als >/dev/null || { echo "harness: ALS did not start"; exit 2; }
  set_cell_content 0 "$CELL0" >/dev/null
  click_toolbar_button "+ Code" >/dev/null
  set_cell_content 1 "$CELL1" >/dev/null
  # Load from cell 1, so a command in cell 2 must re-load the prefix 1..2 first.
  press_agda_chord_in_cell 0 l KeyL >/dev/null
  wait_for_log_contains "Load finished." 60000 || { echo "harness: load failed"; log_text; exit 2; }
  ab eval "(() => {
    const els = document.querySelectorAll('.literate-cell-editor .cm-content')
    const v0 = els[0].cmTile.view, v1 = els[1].cmTile.view
    const orig = console.log; window.__give = ''
    console.log = function (...a) {
      try { if (a[0] === '<--') { const s = JSON.stringify(a[1] ?? ''); const i = s.indexOf('Cmd_give'); if (i >= 0) window.__give = s.slice(i, i + 22) + ' ... ' + s.slice(s.lastIndexOf('])') + 2, s.lastIndexOf('])') + 14) } } catch {}
      return orig.apply(this, a)
    }
    v1.focus()
    v1.dispatch({ selection: { anchor: v1.state.doc.toString().indexOf('{! z') + 3 } })
    els[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true, cancelable: true }))
    els[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true, cancelable: true }))
    // A click into cell 1's goal (same focus + selection as cursor_in_cell_goal).
    if ($1) setTimeout(() => { v0.focus(); v0.dispatch({ selection: { anchor: v0.state.doc.toString().indexOf('{! s z') + 3 } }) }, $CLICK_DELAY_MS)
    return true
  })()" >/dev/null
  wait_for_log_matches "Give (failed|finished)" 30000
  ab wait 500 >/dev/null
}

run_sequence 0
ctrl="$(cells_json)"
[[ "$ctrl" == *'q = z'* && "$ctrl" == *'r = {! s z !}'* ]] || { echo "harness: control Give did not fill cell 2's goal: $ctrl"; exit 2; }
echo "control OK: Give in cell 2 -> 'q = z', cell 1 keeps 'r = {! s z !}'"

run_sequence 1
cells="$(cells_json)"
give="$(ab eval 'window.__give' | tail -n1)"
log="$(log_text)"
echo "Cmd_give sent: $give"
echo "cell 1: $(grep -o 'r = [^\\]*' <<<"$cells" | head -1)   cell 2: $(grep -o 'q = [^\\]*' <<<"$cells" | head -1)"
echo "log: $log"
if [[ "$cells" == *'q = {! z !}'* && "$cells" != *'r = {! s z !}'* && "$log" == *'Give finished.'* ]]; then
  echo "FAIL: Give pressed in cell 2's goal was applied to cell 1's goal, where the user clicked while the presync re-load ran"
  exit 1
fi
echo "OK: the Give acted on the goal it was pressed in"
exit 0
); then echo "PASS: click in another cell during the presync re-load"; else echo "FAIL: click in another cell during the presync re-load" >&2; failed=1; fi

# --- delete a cell above a loaded code cell ---
if ( set +e; MODE=delete
# Deleting (or inserting) a cell above a loaded code cell misplaces / drops
# that code cell's goal and highlighting decorations.

literate_open_app
start_als

# Default notebook: .literate-cell 0 = markdown (rendered), 1 = code.
set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

a : N
a = ?" >/dev/null
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 60000

snapshot() {
  ab eval "(() => {
    const el = document.querySelectorAll('.literate-cell-editor .cm-content')[0]
    const holes = Array.from(el.querySelectorAll('.agda-hole')).map(h => h.textContent)
    const kw = Array.from(el.querySelectorAll('[class*=agda-keyword]')).map(h => h.textContent)
    return JSON.stringify({ text: el.cmTile.view.state.doc.toString().slice(0, 20), holes, kw })
  })()"
}
before="$(snapshot)"
echo "before: $before"

if [[ "$MODE" == delete ]]; then
  delete_cell 0 >/dev/null          # delete the leading prose cell
else
  # Make the markdown cell active (Edit), then "+ Code" inserts between it
  # and the loaded code cell.
  ab eval "(() => { document.querySelector('.literate-markdown-edit-btn').click(); return true })()" >/dev/null
  ab wait 300 >/dev/null
  click_toolbar_button "+ Code" >/dev/null
  ab eval "(() => { document.querySelector('.literate-markdown-done-btn')?.click(); return true })()" >/dev/null
fi
ab wait 500 >/dev/null
# After insert, the loaded code cell is editor index 1 (new empty one is 0).
if [[ "$MODE" == insert ]]; then
  after="$(ab eval "(() => {
    const el = document.querySelectorAll('.literate-cell-editor .cm-content')[1]
    const holes = Array.from(el.querySelectorAll('.agda-hole')).map(h => h.textContent)
    const kw = Array.from(el.querySelectorAll('[class*=agda-keyword]')).map(h => h.textContent)
    return JSON.stringify({ text: el.cmTile.view.state.doc.toString().slice(0, 20), holes, kw })
  })()")"
else
  after="$(snapshot)"
fi
echo "after:  $after"

if [[ "$before" != "$after" ]]; then
  echo "FAIL: ${MODE} of another cell changed the loaded code cell's goal/highlight decorations (before=$before after=$after)"
  exit 1
fi
echo "OK: decorations unchanged"
exit 0
); then echo "PASS: delete a cell above a loaded code cell"; else echo "FAIL: delete a cell above a loaded code cell" >&2; failed=1; fi

# --- insert a cell above a loaded code cell ---
if ( set +e; MODE=insert
# Deleting (or inserting) a cell above a loaded code cell misplaces / drops
# that code cell's goal and highlighting decorations.

literate_open_app
start_als

# Default notebook: .literate-cell 0 = markdown (rendered), 1 = code.
set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

a : N
a = ?" >/dev/null
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 60000

snapshot() {
  ab eval "(() => {
    const el = document.querySelectorAll('.literate-cell-editor .cm-content')[0]
    const holes = Array.from(el.querySelectorAll('.agda-hole')).map(h => h.textContent)
    const kw = Array.from(el.querySelectorAll('[class*=agda-keyword]')).map(h => h.textContent)
    return JSON.stringify({ text: el.cmTile.view.state.doc.toString().slice(0, 20), holes, kw })
  })()"
}
before="$(snapshot)"
echo "before: $before"

if [[ "$MODE" == delete ]]; then
  delete_cell 0 >/dev/null          # delete the leading prose cell
else
  # Make the markdown cell active (Edit), then "+ Code" inserts between it
  # and the loaded code cell.
  ab eval "(() => { document.querySelector('.literate-markdown-edit-btn').click(); return true })()" >/dev/null
  ab wait 300 >/dev/null
  click_toolbar_button "+ Code" >/dev/null
  ab eval "(() => { document.querySelector('.literate-markdown-done-btn')?.click(); return true })()" >/dev/null
fi
ab wait 500 >/dev/null
# After insert, the loaded code cell is editor index 1 (new empty one is 0).
if [[ "$MODE" == insert ]]; then
  after="$(ab eval "(() => {
    const el = document.querySelectorAll('.literate-cell-editor .cm-content')[1]
    const holes = Array.from(el.querySelectorAll('.agda-hole')).map(h => h.textContent)
    const kw = Array.from(el.querySelectorAll('[class*=agda-keyword]')).map(h => h.textContent)
    return JSON.stringify({ text: el.cmTile.view.state.doc.toString().slice(0, 20), holes, kw })
  })()")"
else
  after="$(snapshot)"
fi
echo "after:  $after"

if [[ "$before" != "$after" ]]; then
  echo "FAIL: ${MODE} of another cell changed the loaded code cell's goal/highlight decorations (before=$before after=$after)"
  exit 1
fi
echo "OK: decorations unchanged"
exit 0
); then echo "PASS: insert a cell above a loaded code cell"; else echo "FAIL: insert a cell above a loaded code cell" >&2; failed=1; fi

exit "$failed"
