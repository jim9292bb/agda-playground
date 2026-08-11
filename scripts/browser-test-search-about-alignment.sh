#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Regression for Search About / Module Contents not column-aligning their
# `name : type` entries -- confirmed via live vscode-test-web comparison
# against real agda-mode-vscode + ALS-WASM, which pads names to the widest
# one so every `:` lines up (e.g. `_+_     : N -> N -> N`). als-demo's
# formatNameTermList previously did `${name} : ${term}` per line with no
# padding at all.

open_app
start_als

set_editor_fixture "test-fixtures/agda/query-bool.agda"
load_agda

select_text "Bool"
press_agda_chord "z" "KeyZ"
ab wait 3000

assert_queries_contains $'false : Bool\ntest  : Bool\ntrue  : Bool' \
  "Search About column-aligns entries by padding names to the widest one"

echo "browser-test-search-about-alignment: PASS"
