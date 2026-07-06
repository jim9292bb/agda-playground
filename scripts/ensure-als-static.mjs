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
 * Idempotent: a version is skipped when both files are already present.
 * Runs from `npm run setup` (setup-assets.sh) before static verification.
 *
 * Usage: node scripts/ensure-als-static.mjs
 */

import { writeFile, mkdir, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSelectedAlsVersions } from './resolve-deploy-config.mjs'
import { alsWasmFilename, alsWasmUrl, agdaDataZipUrl, download } from './als-release.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AGDA_DATA_ZIP_NAME = 'agda-data.zip'  // must match build-time expectations in src/lib/runtime/interface.ts

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

async function main() {
  const versions = getSelectedAlsVersions().map(v => v.version)
  if (versions.length === 0) {
    console.log('ensure-als-static: no ALS versions referenced in deploy.config.json — nothing to do')
    return
  }

  for (const version of versions) {
    const outDir = join(REPO_ROOT, 'static', 'als', version)
    const wasmPath = join(outDir, alsWasmFilename(version))
    const dataPath = join(outDir, AGDA_DATA_ZIP_NAME)
    if ((await exists(wasmPath)) && (await exists(dataPath))) {
      console.log(`[als ${version}] already present: static/als/${version}/`)
      continue
    }
    await mkdir(outDir, { recursive: true })
    if (!(await exists(wasmPath))) {
      console.log(`[als ${version}] downloading ${alsWasmUrl(version)}`)
      await writeFile(wasmPath, await download(alsWasmUrl(version)))
    }
    if (!(await exists(dataPath))) {
      console.log(`[als ${version}] downloading ${agdaDataZipUrl(version)}`)
      await writeFile(dataPath, await download(agdaDataZipUrl(version)))
    }
  }
}

main().catch(err => { console.error(err.message ?? err); process.exit(1) })
