/**
 * Downloads the runtime ALS assets for every version referenced by
 * deploy.config.json straight into static/als/<version>/ — the app's
 * serving location:
 *
 *   static/als/<version>/als-<version>.wasm   (served as-is)
 *   static/als/<version>/agda-data.zip        (served as-is; contains builtin
 *                                              sources + precompiled .agdai)
 *
 * The als-runtime release publishes assets in exactly this format, so this
 * is a pure download — no extraction, recompilation, or repackaging, and no
 * .deploy-assets/.als/ intermediate.
 *
 * static/als/ is wiped before every run, so `npm run setup` always
 * re-downloads every configured version's wasm + agda-data.zip fresh
 * (rather than the previous skip-if-present behavior) — a real,
 * deliberate cost (large binary downloads) traded for guaranteeing
 * static/als/ never carries a stale or orphaned version directory.
 * Runs from `npm run setup` (setup-assets.sh) before static verification.
 *
 * Usage: node scripts/ensure-als-static.mjs
 */

import { writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSelectedAlsVersions } from './resolve-deploy-config.mjs'
import { alsWasmFilename, alsWasmUrl, agdaDataZipUrl, download } from './als-release.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AGDA_DATA_ZIP_NAME = 'agda-data.zip'  // must match build-time expectations in src/lib/runtime/interface.ts

async function main() {
  const versions = getSelectedAlsVersions().map(v => v.version)
  if (versions.length === 0) {
    console.log('ensure-als-static: no ALS versions referenced in deploy.config.json — nothing to do')
    return
  }

  await rm(join(REPO_ROOT, 'static', 'als'), { recursive: true, force: true })

  for (const version of versions) {
    const outDir = join(REPO_ROOT, 'static', 'als', version)
    const wasmPath = join(outDir, alsWasmFilename(version))
    const dataPath = join(outDir, AGDA_DATA_ZIP_NAME)
    await mkdir(outDir, { recursive: true })
    console.log(`[als ${version}] downloading ${alsWasmUrl(version)}`)
    await writeFile(wasmPath, await download(alsWasmUrl(version)))
    console.log(`[als ${version}] downloading ${agdaDataZipUrl(version)}`)
    await writeFile(dataPath, await download(agdaDataZipUrl(version)))
  }
}

main().catch(err => { console.error(err.message ?? err); process.exit(1) })
