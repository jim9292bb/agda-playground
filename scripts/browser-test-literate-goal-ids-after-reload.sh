#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regressions for the notebook's goal ids after a re-load (each goal
# command first re-loads the prefix up to its cell; Agda renumbers goals on
# every Load):
# 1. Give in g, then Case split in f: the re-load's ids were merged into the
#    old ones, so the Case split sent ?1, which Agda no longer has.
# 2. A second Load with no edit cleared the goals and loaded nothing.
# 3. After an environment switch, the cached prefix key skipped the re-load
#    and the goal command failed with "no such interaction point".
# Expected: a Load's InteractionPoints replace the tracked goals
# (agda-mode-vscode Goals.resetGoalIndicesOnLoad), an explicit Load always
# re-checks, and a new worker starts with nothing cached.

goal_ids() {
  ab eval "Array.from(document.querySelectorAll('.literate-cell-editor [data-goal-id]')).map(n => n.getAttribute('data-goal-id')).join(' ')" | tr -d '"'
}
log_since_mark() {
  ab eval "(() => { const p = document.querySelector('.messages-panel'); return p.dataset.logContent.slice(Number(p.dataset.mark ?? 0)) })()"
}
mark_log() {
  ab eval "(() => { const p = document.querySelector('.messages-panel'); p.dataset.mark = p.dataset.logContent.length; return true })()" >/dev/null
}

literate_open_app
start_als
set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

g : N
g = {! z !}

f : N -> N
f n = {! n !}" >/dev/null
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 60000

# --- 1. Give, then Case split on the renumbered goal ---
cursor_in_cell_goal 0 0 >/dev/null
press_agda_chord_in_cell 0 " " "Space" >/dev/null
wait_for_log_contains "Give finished." 30000
cursor_in_cell_goal 0 0 >/dev/null
press_agda_chord_in_cell 0 "c" "KeyC" >/dev/null
wait_for_log_matches "Case split (finished|failed)|Load (finished|failed)" 60000
ab wait 3000 >/dev/null
assert_cell_contains 0 "f z = {!   !}" "Case split after a Give splits f"
assert_cell_contains 0 "f (s n) = {!   !}" "Case split's second clause"
[[ "$(goal_ids)" == "0 1" ]] || { echo "FAIL: goal ids after Case split are '$(goal_ids)', expected '0 1'" >&2; exit 1; }
echo "PASS: each goal is tracked once, with Agda's current ids"

# --- 2. Load twice without an edit ---
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 60000
press_agda_chord_in_cell 0 "l" "KeyL" >/dev/null
wait_for_log_contains "Load finished." 60000
assert_log_contains "Checking source" "the second Load re-checks"
[[ "$(goal_ids)" == "0 1" ]] || { echo "FAIL: goals after a second Load are '$(goal_ids)'" >&2; exit 1; }
echo "PASS: a second Load keeps the goals"

# --- 3. Environment switch, then a goal command ---
target="2.7.0.1"
[[ "$(current_environment_label)" == *2.7.0.1* ]] && target="2.8.0"
pick_environment "$target" >/dev/null
ab wait 1500 >/dev/null
start_als >/dev/null
mark_log
run_agda_chord_at_cell_goal 0 0 t KeyT >/dev/null
for _ in $(seq 1 60); do
  [[ "$(log_since_mark)" == *"Goal type f"* ]] && break
  ab wait 500 >/dev/null
done
log="$(log_since_mark)"
if [[ "$log" != *"Goal type finished."* ]]; then
  echo "FAIL: goal command after an environment switch: $log" >&2; exit 1
fi
echo "PASS: a goal command works after an environment switch"
