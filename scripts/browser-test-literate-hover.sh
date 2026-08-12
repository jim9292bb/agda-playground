#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# Regression for hover tooltips being wired only to /literate's hidden
# composite EditorView (never rendered, never hovered) instead of the
# visible per-cell EditorViews users actually see and point at --
# `agdaController.lspClientCompartment` (which carries `hoverTooltips()`)
# was only present in the hidden view's own extensions, so hovering over
# Agda code in a cell produced no tooltip at all. Fixed by adding
# `hoverTooltipsForCell` (lsp-hover.ts) to each code cell's own extensions,
# translating cell-local <-> hidden-document positions via
# cellPositionToGlobal/globalPositionToCell (literate-cell-sync.js).

literate_open_app
start_als

set_cell_content 0 "data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
z + b = b
s a + b = s (a + b)"

press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 30000

# Hover over the "s" that starts the second _+_ clause ("s a + b = ...").
# Its type (N -> N) should show up as a tooltip anchored near that
# character -- computed via view.posAtCoords rather than a hardcoded pixel
# offset, since exact character width can vary with font metrics.
ab eval "(() => {
  const cell = document.querySelectorAll('.literate-cell-editor .cm-content')[0]
  const view = cell.cmTile.view
  const doc = view.state.doc.toString()
  const line = doc.split('\n').findIndex(l => l.startsWith('s a + b ='))
  if (line < 0) throw new Error('fixture line not found')
  const lineFrom = view.state.doc.line(line + 1).from
  const coords = view.coordsAtPos(lineFrom)
  if (!coords) throw new Error('could not resolve coordinates for the hover target')
  window.__hoverTarget = { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 }
  return window.__hoverTarget
})()"

ab eval "(() => {
  const { x, y } = window.__hoverTarget
  const el = document.elementFromPoint(x, y)
  el.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
  return { ok: true }
})()"
ab wait 1000 >/dev/null

ab eval "(() => {
  const tooltip = document.querySelector('.cm-lsp-hover-tooltip')
  if (!tooltip) throw new Error('No hover tooltip appeared')
  const text = tooltip.textContent ?? ''
  if (!text.includes('N') || !text.includes('→')) {
    throw new Error('Hover tooltip did not show the expected N -> N type: ' + JSON.stringify(text))
  }
  const rect = tooltip.getBoundingClientRect()
  const target = window.__hoverTarget
  // The tooltip should be anchored near the hovered character, not at some
  // unrelated position (e.g. the hidden view's own coordinates, which
  // would place it far outside the visible viewport or at (0,0)).
  if (Math.abs(rect.left - target.x) > 200 || rect.top < target.y - 10 || rect.top > target.y + 200) {
    throw new Error('Hover tooltip is not anchored near the hovered character: ' +
      JSON.stringify({ tooltipRect: rect, target }))
  }
  return { ok: true, text }
})()"
echo "PASS hover tooltip shows the correct type, anchored at the hovered character"

echo "browser-test-literate-hover: PASS"
