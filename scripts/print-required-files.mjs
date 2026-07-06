/**
 * Verifies that everything needed for `npm run setup` is present:
 *   - Each configured library's .agda-lib file (confirms the source is
 *     reachable at the agdaLibPath in deploy.config.json).
 *   - Each ALS version's wasm file and agda-data.zip under static/als/
 *     (downloaded there by scripts/ensure-als-static.mjs).
 *
 * Libraries with agdaiDir configured that are missing their cache (.agdai files
 * or manifest) get a non-fatal warning — the library still works, just
 * without prefetching.
 *
 * Exits non-zero if any required file is missing.
 *
 * Usage: node scripts/print-required-files.mjs
 */

import { access } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { REPO_ROOT, getLocalLibraries, getSelectedAlsVersions } from './resolve-deploy-config.mjs'

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  let missing = false
  const libs = getLocalLibraries()

  if (libs.length === 0) {
    console.error('No libraries configured — set agdaLibPath in each profile\'s libraries in deploy.config.json.')
    process.exit(1)
  }

  for (const lib of libs) {
    if (!(await exists(lib.agdaLibPath))) {
      console.error(`MISSING: ${lib.agdaLibPath}  (library "${lib.name}" — check agdaLibPath in deploy.config.json)`)
      missing = true
    }

    if (lib.agdaiDir) {
      if (!(await exists(join(lib.agdaiDir, '_build')))) {
        console.log(`(optional, not found) ${relative(REPO_ROOT, lib.agdaiDir)}/_build/ for "${lib.name}" — no prebuilt .agdai, run \`npm run build-agdai -- ${lib.agdaLibPath} ${lib.agdaiDir}\``)
      }
      if (!(await exists(join(lib.agdaiDir, 'agdai-manifest.json')))) {
        console.log(`(optional, not found) ${relative(REPO_ROOT, lib.agdaiDir)}/agdai-manifest.json for "${lib.name}" — prefetch disabled, run \`npm run generate-manifest\``)
      }
    }
  }

  for (const als of getSelectedAlsVersions()) {
    const alsRoot = join(REPO_ROOT, 'static', 'als', als.version)
    if (!(await exists(join(alsRoot, als.wasmFilename)))) {
      console.error(`MISSING: static/als/${als.version}/${als.wasmFilename}`)
      missing = true
    }
    if (!(await exists(join(alsRoot, 'agda-data.zip')))) {
      console.error(`MISSING: static/als/${als.version}/agda-data.zip`)
      missing = true
    }
  }

  if (missing) {
    console.error('')
    console.error('Some required files are missing. Either:')
    console.error("  - run 'npm run auto-configure' to fetch this project's own shipped defaults, or")
    console.error('  - place the files by hand (see DEPLOYMENT.md)')
    process.exit(1)
  }
}

main()
