#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# Same hover fix as /literate (see browser-test-literate-hover.sh) verified
# against a real PLFA chapter's own content instead of a hand-typed
# fixture. /plfa's cellExtensions()/hoverTooltipsForCell wiring is
# byte-identical to /literate's, but this app is the only thing that's
# actually exercised it live before -- lock that in.

plfa_open_app
start_als

select_plfa_chapter "Naturals"
ab wait 500 >/dev/null

press_agda_chord_in_cell 0 "l" "KeyL"
wait_for_log_contains "Load finished." 60000

# Hover over "zero" in the chapter's own `data N : Set where zero : N ...`
# definition -- computed via view.coordsAtPos (skipping the line's own
# indentation) rather than a hardcoded pixel offset.
ab eval "(() => {
  const cell = document.querySelectorAll('.literate-cell-editor .cm-content')[0]
  cell.scrollIntoView({block: 'center'})
  const view = cell.cmTile.view
  const doc = view.state.doc.toString()
  const lineIndex = doc.split('\n').findIndex(l => l.trim().startsWith('zero'))
  if (lineIndex < 0) throw new Error('fixture line not found: ' + doc)
  const lineObj = view.state.doc.line(lineIndex + 1)
  const indent = lineObj.text.match(/^\s*/)[0].length
  const pos = lineObj.from + indent + 2
  const coords = view.coordsAtPos(pos)
  if (!coords) throw new Error('could not resolve coordinates for the hover target')
  window.__hoverTarget = { x: coords.left, y: (coords.top + coords.bottom) / 2 }
  return window.__hoverTarget
})()"

ab eval "(() => {
  const { x, y } = window.__hoverTarget
  const el = document.elementFromPoint(x, y)
  el.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
  return { ok: true }
})()"
ab wait 1200 >/dev/null

ab eval "(() => {
  const tooltip = document.querySelector('.cm-lsp-hover-tooltip')
  if (!tooltip) throw new Error('No hover tooltip appeared')
  const text = tooltip.textContent ?? ''
  if (!text.includes('N') && !text.includes('ℕ')) {
    throw new Error('Hover tooltip did not show the expected N type: ' + JSON.stringify(text))
  }
  const rect = tooltip.getBoundingClientRect()
  const target = window.__hoverTarget
  if (Math.abs(rect.left - target.x) > 200 || rect.top < target.y - 10 || rect.top > target.y + 200) {
    throw new Error('Hover tooltip is not anchored near the hovered character: ' +
      JSON.stringify({ tooltipRect: rect, target }))
  }
  return { ok: true, text }
})()"
echo "PASS hover tooltip shows the correct type, anchored at the hovered character"

echo "browser-test-plfa-hover: PASS"
