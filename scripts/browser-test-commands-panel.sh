#!/usr/bin/env bash
set -euo pipefail

# The header's Commands menu: commands grouped into File / Goal with their
# key bindings, the file actions (copy / open / export) under File, search
# filtering, Enter to run the first match, Escape to close (focus back on the
# toggle), Ctrl-K to open it from anywhere, and a picked command really runs.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

open_app
start_als

set_editor_fixture "test-fixtures/agda/query-goal.agda" "{! n !}" 4

# ── Open the menu: groups, labels and key bindings ──────────────────────────
ab eval "(async () => {
  const toggle = document.querySelector('.commands-menu-toggle')
  if (!toggle) throw new Error('Commands menu toggle button missing')
  toggle.click()
  await new Promise(r => setTimeout(r, 200))

  const menu = document.querySelector('#commands-menu')
  if (!menu) throw new Error('Commands menu missing after click')
  if (toggle.getAttribute('aria-expanded') !== 'true') throw new Error('Toggle aria-expanded should be true')
  if (document.activeElement !== menu.querySelector('input[type=search]')) throw new Error('Search field should be focused when the menu opens')

  const groups = Array.from(menu.querySelectorAll('[role=group]')).map(g => g.getAttribute('aria-label'))
  if (groups[0] !== 'File' || !groups[1]?.startsWith('Goal')) throw new Error('Expected File and Goal groups, got: ' + groups.join(', '))

  const items = Array.from(menu.querySelectorAll('.commands-menu-item'))
    .map(b => [b.querySelector('.commands-menu-item-label').textContent.trim(), b.querySelector('kbd')?.textContent.trim() ?? ''])
  if (items.length < 18) throw new Error('Too few commands: ' + items.length)
  const has = (label, keys) => items.some(([l, k]) => l === label && k === keys)
  const expected = [['Load', 'C-c C-l'], ['Give', 'C-c C-SPC'], ['Case split', 'C-c C-c'], ['Goal type', 'C-c C-t'],
    ['Copy code', ''], ['Open file…', ''], ['Export file', '']]
  const missing = expected.filter(([l, k]) => !has(l, k))
  if (missing.length) throw new Error('Missing commands: ' + JSON.stringify(missing))
  const fileGroup = menu.querySelector('[role=group][aria-label=File]').textContent
  if (!fileGroup.includes('Load') || fileGroup.includes('Case split')) throw new Error('Load belongs under File and Case split under Goal')
  return { ok: true, count: items.length }
})()" >/dev/null
echo "PASS commands menu groups commands with their key bindings"

# ── Search filters; Escape closes and refocuses the toggle ───────────────────
ab eval "(async () => {
  const input = document.querySelector('#commands-menu input[type=search]')
  input.value = 'case'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise(r => setTimeout(r, 100))
  const labels = Array.from(document.querySelectorAll('#commands-menu .commands-menu-item-label')).map(l => l.textContent.trim())
  if (labels.length !== 1 || labels[0] !== 'Case split') throw new Error('Search for case should leave only Case split, got: ' + labels.join(', '))
  input.value = 'zzz-no-such-command'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise(r => setTimeout(r, 100))
  if (!document.querySelector('#commands-menu .commands-menu-empty')) throw new Error('No-match message missing')
  return { ok: true }
})()" >/dev/null
ab press Escape >/dev/null
ab wait 200 >/dev/null
[[ "$(ab eval "Boolean(document.querySelector('#commands-menu'))" | tail -n 1)" == "false" ]] || fail "Escape did not close the menu"
[[ "$(ab eval "document.activeElement?.classList.contains('commands-menu-toggle') ?? false" | tail -n 1)" == "true" ]] || fail "Escape did not return focus to the toggle"
echo "PASS search filters the menu; Escape closes it and refocuses the toggle"

# ── Ctrl-K opens it from the editor; typing + Enter runs the first match ────
ab eval "(() => { document.querySelector('.cm-content').cmTile.view.focus(); return true })()" >/dev/null
ab press Control+k >/dev/null
ab wait 200 >/dev/null
[[ "$(ab eval "Boolean(document.querySelector('#commands-menu'))" | tail -n 1)" == "true" ]] || fail "Ctrl-K did not open the menu"
_begin_load_wait
ab eval "(() => {
  const input = document.querySelector('#commands-menu input[type=search]')
  input.value = 'load'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()" >/dev/null
ab wait 100 >/dev/null
ab press Enter >/dev/null
_poll_load_completion 0 30000
assert_log_contains "Load finished." "Enter on the search field runs Load"
assert_active_goal_contains "?0" "Load from the Commands menu updates goals"
[[ "$(ab eval "Boolean(document.querySelector('#commands-menu'))" | tail -n 1)" == "false" ]] || fail "Running a command did not close the menu"
echo "PASS Ctrl-K opens the menu and Enter runs the first match"

echo "browser-test-commands-panel: PASS"
