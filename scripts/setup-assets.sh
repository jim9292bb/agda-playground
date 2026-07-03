#!/usr/bin/env bash
# Prepares static/ for serving from whatever's already in
# .deploy-assets/.als/ — raw library source, raw .agdai files, raw
# ALS wasm/data, and an optional dependency-graph file. Does NOT download
# anything itself. Run `npm run auto-configure` first (to fetch this
# project's own shipped defaults) or place files in
# .deploy-assets/.als/ by hand (see DEPLOYMENT.md) before running this.
#
# Run after cloning (and after .deploy-assets/.als/ are populated):
#   npm run setup
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Verifying required assets are present..."
node "$SCRIPT_DIR/print-required-files.mjs"

echo "Generating scripts/generated-libraries.mjs from placed .agda-lib files..."
node "$SCRIPT_DIR/generate-library-info.mjs"

echo "Generating scripts/generated-als-info.mjs from .deploy-assets/.als/ contents..."
node "$SCRIPT_DIR/generate-als-info.mjs"

echo "Building static/ from .deploy-assets/.als/..."
node "$SCRIPT_DIR/build-static-assets.mjs"

echo "Done. Static assets are ready."
