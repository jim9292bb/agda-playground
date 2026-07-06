#!/usr/bin/env bash
# Prepares static/ for serving:
#   1. Downloads the ALS runtime assets (wasm + agda-data.zip) for every
#      version referenced in deploy.config.json straight into static/als/
#      from this project's als-runtime release (skipped when present).
#   2. Verifies libraries and ALS assets are in place.
#   3. Regenerates the generated-*.mjs files consumed by the app bundle.
#   4. Packages library sources and .agdai caches into static/.
#
# Library sources must already be present (run `npm run auto-configure` for
# this project's shipped defaults, or place them by hand — see DEPLOYMENT.md).
#
# Run after cloning:
#   npm run setup
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Fetching ALS runtime assets into static/als/..."
node "$SCRIPT_DIR/ensure-als-static.mjs"

echo "Verifying required assets are present..."
node "$SCRIPT_DIR/print-required-files.mjs"

echo "Generating scripts/generated-libraries.mjs from placed .agda-lib files..."
node "$SCRIPT_DIR/generate-library-info.mjs"

echo "Generating scripts/generated-als-info.mjs..."
node "$SCRIPT_DIR/generate-als-info.mjs"

echo "Building static/ library assets..."
node "$SCRIPT_DIR/build-static-assets.mjs"

echo "Done. Static assets are ready."
