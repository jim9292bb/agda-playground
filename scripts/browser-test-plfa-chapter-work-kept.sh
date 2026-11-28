#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# Regression: /plfa had one saved document. Picking another chapter, or
# reloading a ?chapter= link, replaced it with the pristine chapter, so a
# student's exercise answers were lost without a warning. Expected: each
# chapter keeps its own saved work across switching, reloading the
# ?chapter= URL and a plain /plfa visit (which reopens the last chapter);
# "Reset ... to the original" brings back the pristine chapter.

PLAIN_URL="$APP_URL"
MARK="myExerciseAnswer-$RANDOM"

url() { ab eval "location.href" | tr -d '"'; }
assert_mark() {
  local expected="$1" label="$2" text
  text="$(ab eval "Array.from(document.querySelectorAll('.literate-cell-editor .cm-content')).map(c => c.cmTile.view.state.doc.toString()).join('\n')")"
  if [[ "$expected" == yes && "$text" != *"$MARK"* ]]; then echo "FAIL: $label: the exercise work is gone" >&2; exit 1; fi
  if [[ "$expected" == no && "$text" == *"$MARK"* ]]; then echo "FAIL: $label: the work is still there" >&2; exit 1; fi
  echo "PASS: $label"
}

plfa_open_app
select_plfa_chapter "Naturals" >/dev/null
assert_cell_contains 0 "data ℕ : Set where" "Naturals is open"
append_cell_content 0 "

$MARK : ℕ
$MARK = suc zero" >/dev/null
ab wait 1500 >/dev/null
[[ "$(url)" == *'chapter=Naturals'* ]] || { echo "FAIL: URL does not name the open chapter: $(url)" >&2; exit 1; }

select_plfa_chapter "Induction" >/dev/null
ab wait 500 >/dev/null
assert_cell_contains 0 "Relation.Binary.PropositionalEquality" "Induction is open"
assert_mark no "Induction does not show Naturals' work"
[[ "$(url)" == *'chapter=Induction'* ]] || { echo "FAIL: URL did not follow the chapter: $(url)" >&2; exit 1; }

select_plfa_chapter "Naturals" >/dev/null
ab wait 500 >/dev/null
assert_mark yes "switching back to Naturals restores its work"

ab reload >/dev/null
wait_for_app_ready .literate-cell
ab wait 1000 >/dev/null
assert_mark yes "reloading ?chapter=Naturals keeps the work"

ab open "$PLAIN_URL" >/dev/null
wait_for_app_ready .literate-cell
ab wait 1000 >/dev/null
assert_mark yes "a plain /plfa visit reopens Naturals with its work"

ab eval "(() => { window.confirm = () => true; document.querySelector('.header-examples-btn').click(); return true })()" >/dev/null
ab wait 400 >/dev/null
ab eval "(() => { const b = [...document.querySelectorAll('.header-examples-item')].find(b => b.textContent.trim().startsWith('Reset')); b.click(); return true })()" >/dev/null
ab wait 1000 >/dev/null
assert_mark no "Reset brings back the original chapter"
assert_cell_contains 0 "data ℕ : Set where" "the original Naturals is open after Reset"
