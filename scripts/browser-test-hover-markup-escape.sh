#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE="$REPO_ROOT/test-fixtures/agda/hover-markup-escape.agda"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regression: the hover tooltip must show Agda's type as text. ALS sends the
# type as one Markdown code block without escaping the fence, and Agda
# identifiers may contain ` < > = '. The fixture's type wraps so that one line
# is just ```, which used to close the fence and let the rest render as HTML.
# Expected: no element is created from the type and the tooltip text is the
# type verbatim. Checked on / and /literate (each cell has its own hover).

# $1: JS expression for the EditorView to hover.
hover_victim_and_check() {
  local view_expr="$1" route="$2"
  ab eval "(() => {
    const view = $view_expr
    const pos = view.state.doc.toString().lastIndexOf('victim') + 2
    const c = view.coordsAtPos(pos)
    const x = c.left + 1, y = (c.top + c.bottom) / 2
    document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
    return true })()" >/dev/null
  local ready=false
  for _ in $(seq 1 30); do
    ab wait 500 >/dev/null
    if [[ "$(ab eval "(() => { const t = document.querySelector('.cm-lsp-hover-tooltip'); return !!t && !t.classList.contains('cm-lsp-hover-tooltip--loading') && t.textContent.length > 0 })()")" == *true* ]]; then
      ready=true; break
    fi
  done
  [[ "$ready" == true ]] || { echo "FAIL ($route): hover tooltip never appeared" >&2; exit 1; }
  local result
  result="$(ab eval "(() => {
    const t = document.querySelector('.cm-lsp-hover-tooltip')
    return JSON.stringify({
      injected: window.xss === 1,
      elements: [...t.querySelectorAll('*')].map(e => e.tagName.toLowerCase()).filter(n => !['pre', 'code', 'span', 'br'].includes(n)),
      text: t.textContent,
    }) })()")"
  if [[ "$result" == *'\"injected\":true'* || "$result" != *'\"elements\":[]'* ]]; then
    echo "FAIL ($route): hover type was rendered as HTML: $result" >&2; exit 1
  fi
  for piece in '```' "<img src='x' onerror='xss=1'>"; do
    if [[ "$result" != *"$piece"* ]]; then
      echo "FAIL ($route): hover text is missing '$piece': $result" >&2; exit 1
    fi
  done
  echo "PASS ($route): hover shows the type as text"
}

# --- / --- (browser-literate-common.sh points APP_URL at /literate)
APP_URL="${APP_URL%literate}" open_app
start_als
ab eval "(() => {
  const view = document.querySelector('.cm-content').cmTile.view
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: $(json_file "$FIXTURE") } })
  view.focus(); return true })()" >/dev/null
load_agda
hover_victim_and_check "document.querySelector('.cm-content').cmTile.view" "/"

# --- /literate ---
literate_open_app
start_als
set_cell_content 0 "$(sed '1,2d' "$FIXTURE")"
press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 60000
hover_victim_and_check "document.querySelectorAll('.literate-cell-editor .cm-content')[0].cmTile.view" "/literate"
