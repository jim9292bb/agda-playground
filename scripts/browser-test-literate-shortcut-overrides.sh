#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/browser-literate-common.sh
source "$SCRIPT_DIR/browser-literate-common.sh"

# /literate keeps shortcut overrides under its own localStorage namespace
# (see NotebookPage.svelte's LS_SHORTCUT_OVERRIDES_KEY): saving or resetting
# there must never touch the `/` route's key, and vice versa.
LIT_KEY='agda-playground-literate.shortcut-overrides.v1'
ROOT_KEY='agda-playground.shortcut-overrides.v1'

literate_open_app

# Seeded values below are valid overrides (validateAgdaShortcutOverrides
# accepts them), so the test never depends on an invalid saved state.
# Both keys are removed on exit, pass or fail, so a failed assertion can't
# leave a rebound Load key in the shared agent-browser profile.
cleanup_override_keys() {
  ab eval "(() => { localStorage.removeItem('$LIT_KEY'); localStorage.removeItem('$ROOT_KEY'); return { ok: true } })()" >/dev/null || true
}
trap cleanup_override_keys EXIT

# Seed a saved override for this namespace plus a sentinel in `/`'s key,
# then reload so the page picks the override up at startup.
ab eval "(() => {
  localStorage.setItem('$LIT_KEY', JSON.stringify({ load: 'C-c C-g' }))
  localStorage.setItem('$ROOT_KEY', JSON.stringify({ load: 'C-c C-j' }))
  return { ok: true }
})()"
ab reload >/dev/null
wait_for_app_ready .literate-cell
wait_for_button "Settings" 30000

ab eval "(async () => {
  const settings = Array.from(document.querySelectorAll('button'))
    .find(button => (button.getAttribute('aria-label') || '').trim() === 'Settings')
  if (!settings) throw new Error('Settings button missing')
  settings.click()
  await new Promise(r => setTimeout(r, 100))
  const commandsTab = Array.from(document.querySelectorAll('.settings-segmented-control button'))
    .find(button => button.textContent.trim() === 'Commands')
  if (!commandsTab) throw new Error('Commands segment missing')
  commandsTab.click()
  await new Promise(r => setTimeout(r, 100))
  return { ok: true }
})()"

LOAD_ROW="Array.from(document.querySelectorAll('.shortcut-settings-row')).find(row => row.querySelector('strong')?.textContent?.trim() === 'Load')"

ab eval "(() => {
  const row = $LOAD_ROW
  if (!row) throw new Error('Load row missing')
  const draft = row.querySelector('input').value
  if (draft !== 'C-c C-g') throw new Error('Expected saved literate override as draft, got: ' + JSON.stringify(draft))
  if (!row.textContent.includes('Effective: C-c C-g')) throw new Error('Effective binding not overridden: ' + row.textContent)
  return { ok: true }
})()"
echo "PASS override loaded from the literate namespace"

ab eval "(async () => {
  const input = ($LOAD_ROW).querySelector('input')
  input.value = 'C-c C-y'
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'C-c C-y' }))
  await new Promise(r => setTimeout(r, 100))
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save shortcuts').click()
  await new Promise(r => setTimeout(r, 100))
  const lit = JSON.parse(localStorage.getItem('$LIT_KEY') ?? 'null')
  const root = JSON.parse(localStorage.getItem('$ROOT_KEY') ?? 'null')
  if (lit?.load !== 'C-c C-y') throw new Error('Literate key not saved: ' + JSON.stringify(lit))
  if (root?.load !== 'C-c C-j') throw new Error('Root key was touched: ' + JSON.stringify(root))
  const msg = document.querySelector('.settings-message')?.textContent.trim()
  if (msg !== 'Shortcut overrides saved.') throw new Error('Unexpected message: ' + msg)
  return { ok: true }
})()"
echo "PASS save writes only the literate key"

ab eval "(async () => {
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Reset to defaults').click()
  await new Promise(r => setTimeout(r, 100))
  if (localStorage.getItem('$LIT_KEY') !== null) throw new Error('Literate key not removed')
  const root = JSON.parse(localStorage.getItem('$ROOT_KEY') ?? 'null')
  if (root?.load !== 'C-c C-j') throw new Error('Root key was touched by reset: ' + JSON.stringify(root))
  const msg = document.querySelector('.settings-message')?.textContent.trim()
  if (msg !== 'Shortcut overrides reset to defaults.') throw new Error('Unexpected message: ' + msg)
  const draft = ($LOAD_ROW).querySelector('input').value
  if (draft !== '') throw new Error('Draft not cleared: ' + JSON.stringify(draft))
  return { ok: true }
})()"
echo "PASS reset clears only the literate key"

echo "browser-test-literate-shortcut-overrides: PASS"
