#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regression: opening a .lagda.md saved with CRLF line endings kept each
# closing ``` inside its code cell (the fence match expected "\n"), so the
# assembled document had an extra fence and Load failed with a ParseError.
# Agda itself reads CRLF files. Expected: same cells as the LF file, Load ok.
# (.gitattributes keeps the fixture's CRLF line endings.)

literate_open_app
start_als
ab upload 'input[type=file]' "$REPO_ROOT/test-fixtures/agda/crlf.lagda.md" >/dev/null
wait_for_log_contains "File loaded into editor." 10000

texts="$(ab eval "(() => JSON.stringify([...document.querySelectorAll('.literate-cell-editor .cm-content')].map(e => e.cmTile.view.state.doc.toString())))()")"
if [[ "$texts" == *'```'* ]]; then
  echo "FAIL: a code cell kept its closing fence: $texts" >&2; exit 1
fi
echo "PASS: code cells hold no fence text"

press_agda_chord_in_cell 1 "l" "KeyL" >/dev/null
wait_for_log_matches "Load (finished|failed)" 90000
assert_log_contains "Load finished." "CRLF file loads"
assert_log_contains "?0 : N" "goal of the second cell"
