#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
start_als
load_agda

# Ctrl-c Ctrl-x Ctrl-h: toggle implicit arguments.
ab eval "(() => {
  const target = document.querySelector('.cm-content')
  const view = target?.cmTile?.view
  if (!view || !target) throw new Error('missing editor')
  view.focus()
  for (const key of ['c', 'x', 'h']) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true }))
  }
  return { ok: true }
})()"

wait_for_log_contains "Toggle implicit arguments finished." 10000
assert_log_contains "Toggle implicit arguments finished." "toggle implicit args chord sends ToggleImplicitArgs"

echo "PASS toggle implicit arguments chord dispatches command"

# Settings panel checkbox should reflect the optimistic state flip.
click_button "Settings"
ab eval "(() => {
  const editorTab = Array.from(document.querySelectorAll('.settings-segmented-control button'))
    .find(button => button.textContent.trim() === 'Editor')
  if (!editorTab) throw new Error('Editor segment missing')
  editorTab.click()
})()"
ab wait 100 >/dev/null

result="$(ab eval "(() => {
  const rows = Array.from(document.querySelectorAll('.settings-toggle-row'))
  const implicitRow = rows.find(row => row.textContent.includes('Show implicit arguments'))
  const irrelevantRow = rows.find(row => row.textContent.includes('Show irrelevant arguments'))
  if (!implicitRow || !irrelevantRow) throw new Error('toggle rows missing')
  const implicitCheckbox = implicitRow.querySelector('input[type=checkbox]')
  const irrelevantCheckbox = irrelevantRow.querySelector('input[type=checkbox]')
  return { implicit: implicitCheckbox.checked, irrelevant: irrelevantCheckbox.checked }
})()")"

if [[ "$result" != *'"implicit": true'* ]]; then
  echo "Settings checkbox did not reflect toggled implicit-args state: $result" >&2
  exit 1
fi
if [[ "$result" != *'"irrelevant": false'* ]]; then
  echo "Irrelevant-args checkbox should still be unchecked: $result" >&2
  exit 1
fi

echo "PASS settings checkbox reflects implicit-args toggle state"

# Clicking the irrelevant-args checkbox in Settings should dispatch ToggleIrrelevantArgs.
ab eval "(() => {
  const rows = Array.from(document.querySelectorAll('.settings-toggle-row'))
  const irrelevantRow = rows.find(row => row.textContent.includes('Show irrelevant arguments'))
  const checkbox = irrelevantRow.querySelector('input[type=checkbox]')
  checkbox.click()
  return { ok: true }
})()"

wait_for_log_contains "Toggle irrelevant arguments finished." 10000
assert_log_contains "Toggle irrelevant arguments finished." "settings checkbox click sends ToggleIrrelevantArgs"

result="$(ab eval "(() => {
  const rows = Array.from(document.querySelectorAll('.settings-toggle-row'))
  const irrelevantRow = rows.find(row => row.textContent.includes('Show irrelevant arguments'))
  const checkbox = irrelevantRow.querySelector('input[type=checkbox]')
  return { irrelevant: checkbox.checked }
})()")"

if [[ "$result" != *'"irrelevant": true'* ]]; then
  echo "Irrelevant-args checkbox did not flip after click: $result" >&2
  exit 1
fi

echo "PASS settings checkbox click dispatches ToggleIrrelevantArgs and updates state"
echo "browser-test-implicit-irrelevant-args: PASS"
