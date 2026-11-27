#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression: `?` is a name character in Agda (`is?`, `_≤?_`, `T?`). Give and
# Case split used to replace every `?` in Agda's text with `{!   !}`, turning
# `is? b` into `is{!   !} b`. Only a standalone `?` is a new hole
# (agda-mode-vscode Goals.res parseGoalPositionsFromRefine).

wait_for_editor() {
  local predicate="$1" what="$2"
  for _ in $(seq 1 60); do
    if [[ "$(ab eval "(() => { const t = document.querySelector('.cm-content').cmTile.view.state.doc.toString(); return ($predicate) })()")" == *true* ]]; then
      return 0
    fi
    ab wait 500 >/dev/null
  done
  echo "FAIL: timed out waiting for $what" >&2
  echo "$(editor_text)" >&2
  exit 1
}

open_app
start_als
set_editor_fixture test-fixtures/agda/question-mark-names.agda >/dev/null
load_agda

# Give `is? b` in f's goal.
cursor_in_goal 0 >/dev/null
press_agda_chord " " "Space"
wait_for_editor "!t.includes('{! is? b !}')" "Give"
if [[ "$(editor_text)" != *'f b = is? b'* ]]; then
  echo "FAIL: Give changed the name 'is?': $(editor_text)" >&2; exit 1
fi
wait_for_log_contains "Give finished." 30000
echo "PASS: Give keeps 'is?'"

# Case split not?'s goal. It reloads afterwards, and a Load starts a new log,
# so wait for a log that holds "Load finished." but not the Give.
reloaded() { local log; log="$(log_text)"; [[ "$log" == *'Load finished.'* && "$log" != *'Give finished.'* ]]; }
cursor_in_goal 0 >/dev/null
press_agda_chord "c" "KeyC"
wait_for_editor "t.includes('true =') && t.includes('false =')" "Case split"
for _ in $(seq 1 120); do
  reloaded && break
  ab wait 500 >/dev/null
done
reloaded || { echo "FAIL: no reload after Case split: $(log_text)" >&2; exit 1; }
text="$(editor_text)"
if [[ "$text" != *'not? true = {!'* || "$text" != *'not? false = {!'* ]]; then
  echo "FAIL: Case split changed the name 'not?': $text" >&2; exit 1
fi
assert_log_not_contains "ParseError"
echo "PASS: Case split keeps 'not?'"
