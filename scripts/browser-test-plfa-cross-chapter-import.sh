#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# Each PLFA chapter loads as its own top-level document with the rest of
# the book mounted as a read-only library, so cross-chapter
# `open import plfa.partN.Xxx` references should resolve normally (see
# ROADMAP.md's Notebook Routes section). "Properties" (plfa.part2.Properties)
# is real PLFA content that does exactly this -- it imports both
# plfa.part1.Isomorphism and plfa.part2.Lambda unqualified.
#
# Load succeeding alone would only prove the import *parses*; this test
# appends a throwaway definition that actually *uses* a specific name from
# the imported chapter (Isomorphism's `_≃_` type and `≃-refl` term) so a
# type error would surface if cross-chapter resolution were broken, not
# just an unresolved-module error.

plfa_open_app
start_als

select_plfa_chapter "Properties"
ab wait 500 >/dev/null

count="$(editor_cell_count)"
if [[ "$count" -lt 1 ]]; then
  echo "Expected at least one code cell in the Properties chapter, found $count" >&2
  exit 1
fi
echo "PASS Properties chapter loaded with $count code cells"

last_index=$((count - 1))
assert_cell_contains 0 "open import plfa.part1.Isomorphism" \
  "Properties' own first cell declares the cross-chapter import"

append_cell_content "$last_index" "

testCrossChapterImport : ℕ ≃ ℕ
testCrossChapterImport = ≃-refl"

press_agda_chord_in_cell "$last_index" "l" "KeyL"
wait_for_log_contains "Load finished." 120000

ab eval "(() => {
  const log = document.querySelector('.messages-panel')?.dataset.logContent ?? ''
  if (/error/i.test(log)) {
    throw new Error('Load reported an error -- plfa.part1.Isomorphism\'s _≃_/≃-refl did not resolve: ' + log)
  }
  return { ok: true }
})()"
echo "PASS testCrossChapterImport (using Isomorphism's _≃_ and ≃-refl) type-checks with no error"

echo "browser-test-plfa-cross-chapter-import: PASS"
