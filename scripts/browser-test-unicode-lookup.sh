#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

ab eval "(() => { localStorage.removeItem('agda-playground.shortcut-overrides.v1'); return {ok:true} })()" 2>/dev/null || true
open_app

# Set editor to content with a Unicode arrow (→, U+2192, \to in Agda input)
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  if (!view) return { ok: false, error: 'missing view' }
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: 'f : A → B' },
    selection: { anchor: 6 },
  })
  view.focus()
  return { ok: true }
})()"

# The cursor sits just before → (offset 6), the character looked up.
# (Selecting it instead would make Ctrl-x a cut, not the chord's start.)

# Press C-x to enter the C-x chord prefix
ab eval "(() => {
  const target = document.querySelector('.cm-content')
  if (!target) return { ok: false, error: 'missing editor' }
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', ctrlKey: true, bubbles: true, cancelable: true }))
  return { ok: true }
})()"

# Press = to trigger Unicode lookup
ab eval "(() => {
  const target = document.querySelector('.cm-content')
  if (!target) return { ok: false, error: 'missing editor' }
  target.dispatchEvent(new KeyboardEvent('keydown', { key: '=', code: 'Equal', bubbles: true, cancelable: true }))
  return { ok: true }
})()"

ab wait 500

# Queries panel should contain the code point and at least one input sequence
assert_queries_contains "U+2192" "Unicode lookup shows code point"
assert_queries_contains "to" "Unicode lookup shows \\to sequence"

echo "browser-test-unicode-lookup: PASS"
