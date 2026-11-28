#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regressions: goal commands resolve their goal from hiddenView's selection,
# which followed a cell's caret only when the caret moved. Focus alone --
# Tab into another cell, "+ Code", deleting the active cell -- left it in
# the previous cell, so commands acted on that cell's goal (Give even
# edited it). Expected: the goal under the focused cell's caret.

failed=0

# --- Tab into another cell, then Goal type ---
if ( set +e; 
# Moving focus between cells with the keyboard (Esc, Tab -- CodeMirror's
# documented focus-escape) does not re-sync the hidden view's selection, so
# a goal command typed in the newly focused cell runs on the goal in the
# PREVIOUSLY focused cell.

literate_open_app
start_als
set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

a : N
a = {! !}" >/dev/null
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 30000
click_toolbar_button "+ Code" >/dev/null
ab wait 500 >/dev/null
set_cell_content 1 "g : N -> (N -> N)
g n = {! !}" >/dev/null
press_agda_chord_in_cell 1 "l" "KeyL" >/dev/null
ab wait 300 >/dev/null
wait_for_log_contains "Load finished." 30000   # ?0 : N (cell 1), ?1 : N -> N (cell 2)

# Cursor into cell 2's goal (as a click would), then into cell 1's goal.
cursor_in_cell_goal 1 0 >/dev/null
cursor_in_cell_goal 0 0 >/dev/null

# Real keyboard: Esc then Tab until focus lands in cell 2's editor. Cell 2's
# own caret is still inside its goal.
focused=""
for i in $(seq 1 6); do
  ab press Escape >/dev/null; ab press Tab >/dev/null
  focused="$(ab eval "(() => [...document.querySelectorAll('.literate-cell-editor .cm-content')].indexOf(document.activeElement))()")"
  [[ "$focused" == "1" ]] && break
done
if [[ "$focused" != "1" ]]; then echo "setup failed: could not Tab into cell 2" >&2; exit 2; fi
state="$(ab eval "(() => { const v = document.querySelectorAll('.literate-cell-editor .cm-content')[1].cmTile.view; const d = v.state.doc.toString(); const h = v.state.selection.main.head; return { head: h, inGoal: d.lastIndexOf('{!', h) >= 0 && d.indexOf('!}', h) >= 0, focused: v.hasFocus } })()")"
echo "cell 2 caret: $state"

# Real keyboard chord: Ctrl-c Ctrl-t (Goal type).
ab press Control+c >/dev/null
ab press Control+t >/dev/null
wait_for_log_matches "Goal type (finished|failed)" 30000 || true
ab wait 1000 >/dev/null
result="$(ab eval "(() => document.querySelector('.messages-panel')?.dataset.queryResults ?? '')()")"
echo "Goal type result: $result"
if [[ "$result" != *"→"* ]]; then
  echo "FAIL: Goal type typed in cell 2's goal (type N → N) answered '$result' -- the type of cell 1's goal"
  exit 1
fi
echo "OK"
); then echo "PASS: Tab into another cell, then Goal type"; else echo "FAIL: Tab into another cell, then Goal type" >&2; failed=1; fi

# --- "+ Code", then Give in the empty new cell ---
if ( set +e; 
# Variant: Give (C-c C-SPC) typed in a freshly inserted EMPTY cell gives
# the previous cell's goal (edits code in a cell the user is not in).

literate_open_app
start_als
set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

a : N
a = {! z !}" >/dev/null
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 30000
cursor_in_cell_goal 0 0 >/dev/null
click_toolbar_button "+ Code" >/dev/null
ab wait 800 >/dev/null
focused="$(ab eval "(() => [...document.querySelectorAll('.literate-cell-editor .cm-content')].indexOf(document.activeElement))()")"
echo "focused editor index: $focused (new empty cell is 1)"
if [[ "$focused" != "1" ]]; then echo "setup failed: new cell not focused" >&2; exit 2; fi
ab press Control+c >/dev/null
ab press Control+space >/dev/null
wait_for_log_matches "Give (finished|failed)" 30000 || true
ab wait 1000 >/dev/null
text0="$(cell_text 0)"
echo "cell 1 text after Give typed in empty cell 2: $text0"
if [[ "$text0" == *'a = z"'* ]]; then
  echo "FAIL: Give typed in an empty new cell filled the previous cell's goal (a = {! z !} -> a = z)"
  exit 1
fi
echo "OK"
); then echo "PASS: "+ Code", then Give in the empty new cell"; else echo "FAIL: "+ Code", then Give in the empty new cell" >&2; failed=1; fi

# --- delete the active cell, then Goal type in the focused neighbour ---
if ( set +e; 
# deleteCell variant of keyboard-focus-change-targets-previous-cells-goal:
# deleting the active cell focuses its neighbour without syncing the
# neighbour's selection into hiddenView, so a goal command typed with the
# caret visibly inside the neighbour's goal does not act on that goal.

literate_open_app
start_als
set_cell_content 0 "data N : Set where
  z : N

a : N
a = ?" >/dev/null
click_toolbar_button "+ Code" >/dev/null
ab wait 500 >/dev/null
set_cell_content 1 "g : Set -> Set
g = ?" >/dev/null
press_agda_chord_in_cell 1 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 60000
cursor_in_cell_goal 1 0 >/dev/null     # caret in g's goal (cell 2)
cursor_in_cell_goal 0 0 >/dev/null     # then click into a's goal (cell 1, now active)
delete_cell 1 >/dev/null               # delete the active cell 1 via its hover button
ab wait 800 >/dev/null
state="$(ab eval "(() => { const els=[...document.querySelectorAll('.literate-cell-editor .cm-content')]; const i=els.indexOf(document.activeElement); const v=els[i]?.cmTile.view; const d=v?.state.doc.toString()??''; const h=v?.state.selection.main.head??-1; return JSON.stringify({focused:i, text:d, head:h, inGoal: d.lastIndexOf('{!',h)>=0 && d.indexOf('!}',h)>=0 && d.lastIndexOf('{!',h) > d.lastIndexOf('!}',h-1)}) })()")"
echo "after delete: $state"
ab press Control+c >/dev/null
ab press Control+t >/dev/null
wait_for_log_matches "Goal type (finished|failed)" 60000 || true
ab wait 1000 >/dev/null
result="$(ab eval "(() => document.querySelector('.messages-panel')?.dataset.queryResults ?? '')()")"
tail="$(log_text | sed 's/\\n/\n/g' | tail -n 4)"
echo "query results: $result"; echo "$tail"
if [[ "$result" != *"Set → Set"* ]]; then
  echo "FAIL: after deleting the active cell, Goal type with the caret inside the focused neighbour's goal did not answer for that goal (query results: $result)"
  exit 1
fi
echo OK
); then echo "PASS: delete the active cell, then Goal type in the focused neighbour"; else echo "FAIL: delete the active cell, then Goal type in the focused neighbour" >&2; failed=1; fi

exit "$failed"
