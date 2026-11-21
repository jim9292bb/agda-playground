#!/usr/bin/env bash
set -euo pipefail

# Switching environment while the current one is still starting up. The
# select is only disabled while the WASM downloads ('loading'); once it has
# ('loaded', "Fetching libraries..."), the old backend's init() is still
# awaiting its library zips, so a switch terminates that backend before it
# has created its worker. Once the zips arrive, the old init() must neither
# spawn a worker (it would leak, sharing the new session's stdin/stdout
# buffers) nor hand its result to the controller (overwriting the new
# session's router and status).
#
# Library-zip fetches are held back to keep the 'loaded' window open long
# enough to switch in, and Worker construction/termination is counted to
# detect a leaked worker.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

status_label() {
  ab eval "(() => document.querySelector('.als-status-label')?.textContent.trim() ?? '')()" | tail -n 1 | tr -d '"'
}

select_profile() {
  local needle_json
  needle_json="$(json_string "$1")"
  ab eval "(() => {
    const select = document.querySelector('#control-card-profile-select')
    if (!select) throw new Error('Profile select not found')
    if (select.disabled) throw new Error('Profile select is disabled')
    const option = Array.from(select.options).find(o => o.value.includes($needle_json))
    if (!option) throw new Error('profile option not found: ' + $needle_json)
    select.value = option.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return option.value
  })()" >/dev/null
}

live_workers() {
  ab eval "(() => window.__liveWorkers)()" | tail -n 1 | tr -cd '0-9'
}

peak_live_workers() {
  ab eval "(() => window.__peakLiveWorkers)()" | tail -n 1 | tr -cd '0-9'
}

open_app
start_als

# Count only workers created from here on: the one running now is terminated
# by the first switch through the unwrapped terminate() and isn't tracked.
ab eval "(() => {
  window.__liveWorkers = 0
  window.__peakLiveWorkers = 0
  const NativeWorker = window.Worker
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args)
      window.__liveWorkers++
      window.__peakLiveWorkers = Math.max(window.__peakLiveWorkers, window.__liveWorkers)
      let terminated = false
      const terminate = this.terminate.bind(this)
      this.terminate = () => {
        if (!terminated) { terminated = true; window.__liveWorkers-- }
        terminate()
      }
    }
  }
  window.__holdLibraryZips = true
  const nativeFetch = window.fetch
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (window.__holdLibraryZips && url.includes('/library/') && url.endsWith('.zip')) {
      return new Promise(r => setTimeout(r, 5000)).then(() => nativeFetch(input, init))
    }
    return nativeFetch(input, init)
  }
  return { ok: true }
})()" >/dev/null

select_profile "Cubical v0.8"

# Wait for "Fetching libraries..." -- WASM downloaded, select enabled again,
# init() still waiting on the held-back library zips.
elapsed=0
until [[ "$(status_label)" == Fetching\ libraries* ]]; do
  if (( elapsed >= 30000 )); then
    echo "FAIL: never reached 'Fetching libraries...' (status: $(status_label))" >&2
    exit 1
  fi
  ab wait 100 >/dev/null
  elapsed=$((elapsed + 100))
done
echo "PASS: reached 'Fetching libraries...' with library zips held back"

ab eval "(() => { window.__holdLibraryZips = false })()" >/dev/null
select_profile "ALS 2.8.0"
start_als

# Let the abandoned init()'s held-back zips land (5s hold) and anything it
# would do afterwards happen.
ab wait 8000 >/dev/null

status="$(status_label)"
if [[ "$status" != "Active" ]]; then
  echo "FAIL: status after the abandoned init() settled is '$status', expected 'Active'" >&2
  exit 1
fi
echo "PASS: new session stays Active after the abandoned init() settles"

workers="$(live_workers)"
if [[ "$workers" != "1" ]]; then
  echo "FAIL: $workers live workers after switching mid-init, expected 1" >&2
  exit 1
fi
echo "PASS: exactly one live worker after switching mid-init"

# Not just at the end: the abandoned init() must never spawn a worker at all,
# even one the controller terminates once that init() returns -- in between
# it would run alongside the new session on the same stdin/stdout buffers.
peak="$(peak_live_workers)"
if [[ "$peak" != "1" ]]; then
  echo "FAIL: up to $peak workers were live at once after switching mid-init, expected 1" >&2
  exit 1
fi
echo "PASS: the abandoned init() never spawned a worker"

selected="$(ab eval "(() => document.querySelector('#control-card-profile-select').value)()" | tail -n 1)"
if [[ "$selected" != *"ALS 2.8.0"* ]]; then
  echo "FAIL: selected profile is $selected, expected the ALS 2.8.0 one" >&2
  exit 1
fi

set_editor_fixture "test-fixtures/agda/normalization.agda" >/dev/null
load_agda >/dev/null
assert_log_contains "?0 : T (idN (idN z))" "Load works in the environment switched to mid-init"

echo "PASS: profile-switch-mid-init"
