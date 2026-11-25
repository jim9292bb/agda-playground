#!/usr/bin/env bash
set -euo pipefail

# Switching environment must start ALS exactly once. switchProfile() resets
# alsWorkerStatus to 'initial' and then starts ALS itself, while each page's
# auto-start $effect also starts ALS on seeing 'initial' -- without
# startALSWASM()'s single-flight guard both ran backend.init(), fetching the
# WASM twice and spawning a second worker that leaked (sharing the first one's
# stdin/stdout SharedArrayBuffers). Each backend.init() fetches the profile's
# ALS WASM exactly once, so the page's resource-timing entries for that file
# count how many times ALS was started.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# Prints how many times the WASM at `als-<version>.wasm` has been fetched.
wasm_fetch_count() {
  local version_json
  version_json="$(json_string "$1")"
  ab eval "(() => performance.getEntriesByType('resource')
    .filter(e => e.name.endsWith('/als-' + $version_json + '.wasm')).length)()" | tail -n 1 | tr -cd '0-9'
}

# Selects the first profile whose label contains `needle`; prints its ALS version.
switch_profile() {
  local label
  label="$(pick_environment "$1")"
  # Let the old session tear down so start_als can't see its stale Restart.
  ab wait 150 >/dev/null
  [[ "$label" =~ ALS\ ([0-9.]+) ]] && echo "${BASH_REMATCH[1]}"
}

assert_fetch_count() {
  local version="$1" expected="$2" description="$3"
  local count
  count="$(wasm_fetch_count "$version")"
  if [[ "$count" != "$expected" ]]; then
    echo "FAIL: $description (als-$version.wasm fetched $count times, expected $expected)" >&2
    exit 1
  fi
  echo "PASS: $description"
}

open_app
start_als
initial_label="$(current_environment_label)"
[[ "$initial_label" =~ ALS\ ([0-9.]+) ]] && initial_version="${BASH_REMATCH[1]}"
assert_fetch_count "$initial_version" 1 "initial page load starts ALS once"

other_version="$(switch_profile "Cubical v0.8")"
if [[ "$other_version" == "$initial_version" ]]; then
  echo "FAIL: test needs a profile with a different ALS version than $initial_version" >&2
  exit 1
fi
start_als
# A duplicate start fetches within a millisecond of the first; give any
# straggler time to show up before counting.
ab wait 2000 >/dev/null
assert_fetch_count "$other_version" 1 "switching environment starts ALS once"

set_editor_fixture "test-fixtures/agda/normalization.agda" >/dev/null
load_agda >/dev/null
assert_log_contains "Load finished." "Load works after switching environment"

switch_profile "$initial_version" >/dev/null
start_als
ab wait 2000 >/dev/null
assert_fetch_count "$initial_version" 2 "switching back starts ALS once more"

set_editor_fixture "test-fixtures/agda/normalization.agda" >/dev/null
load_agda >/dev/null
assert_log_contains "?0 : T (idN (idN z))" "Load works after switching back"

echo "PASS: profile-switch-single-start"
