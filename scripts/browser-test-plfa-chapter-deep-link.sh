#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Must be set before sourcing browser-plfa-common.sh (it only defaults
# APP_URL if unset).
APP_URL="${APP_URL:-http://127.0.0.1:8099/plfa}?chapter=Naturals"

# shellcheck source=scripts/browser-plfa-common.sh
source "$SCRIPT_DIR/browser-plfa-common.sh"

# ?chapter=<id> deep-links straight into a chapter (mirroring
# plfa.github.io's own per-chapter URLs) without needing to open the
# Chapters dropdown at all.

plfa_open_app
start_als

count="$(editor_cell_count)"
if [[ "$count" -lt 1 ]]; then
  echo "Expected at least one code cell after deep-linking to Naturals, found $count" >&2
  exit 1
fi

found=false
for ((i = 0; i < count; i++)); do
  text="$(cell_text "$i")"
  if [[ "$text" == *"data ℕ : Set where"* ]]; then
    found=true
    break
  fi
done
if [[ "$found" != true ]]; then
  echo "Naturals chapter content not found after deep-linking via ?chapter=Naturals" >&2
  exit 1
fi
echo "PASS ?chapter=Naturals opens directly into the Naturals chapter"

echo "browser-test-plfa-chapter-deep-link: PASS"
