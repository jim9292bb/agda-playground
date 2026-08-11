#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression for a bug where Give/Refine content containing a bare `?` (e.g.
# refining a goal of type `N -> N` with the partial application `s`, giving
# `s ?`) inserted the `?` as inert plain text instead of a real `{!   !}`
# hole -- Agda itself reports the new sub-goal immediately (visible in the
# log as `?N : ...` from the automatic post-Give Cmd_metas response), but
# the Goals panel showed nothing and the new `?` wasn't clickable until the
# user manually reloaded. Case split's own generated clauses already used
# the `?` -> `{!   !}` convention and fired an 'agda-reload-needed' event to
# get Agda to scan + register the result; Give/Refine's editor-mutations.js
# functions (replaceGoal/removeGoalBoundary) now do the same.

open_app
start_als

set_editor_fixture "test-fixtures/agda/give-embedded-goal.agda"
load_agda

set_goal_content 0 "s ?"
press_agda_chord " " "Space"

# Give's automatic follow-up reload (fired because the given content
# contained a bare ?) calls loadAgdaFile(), which resets the log at its own
# start -- so "Give finished." can be wiped from the log before a
# log-text-based wait ever observes it. Poll the editor content directly
# instead, which is also the thing this test actually cares about.
elapsed=0
while (( elapsed < 30000 )); do
  text="$(editor_text)"
  if [[ "$text" == *'s {!   !}'* ]]; then break; fi
  ab wait 500 >/dev/null
  elapsed=$((elapsed + 500))
done

assert_editor_contains "foo n = s {!   !}" "The bare ? became a real hole"

# The active-goal panel only updates once Agda has actually re-scanned and
# registered the new interaction point (i.e. once the automatic reload
# above has fully completed, not just once the text looks right).
elapsed=0
while (( elapsed < 30000 )); do
  active="$(ab eval "(() => document.querySelector('.goal-entry.active')?.textContent ?? '')()" 2>/dev/null)"
  if [[ "$active" == *'?0'* ]]; then break; fi
  ab wait 500 >/dev/null
  elapsed=$((elapsed + 500))
done
assert_active_goal_contains "?0 : N" "The new goal is registered and shown in the Goals panel"

echo "browser-test-give-embedded-goal: PASS"
