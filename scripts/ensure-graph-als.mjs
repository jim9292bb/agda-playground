/**
 * Installs the ALS WASM build used by local tooling — dependency-graph
 * extraction (Cmd_tokenHighlighting in generate-manifest.mjs) — into
 * .deploy-assets/.als/<GRAPH_ALS_VERSION>/:
 *
 *   als-<version>.wasm   downloaded from the als-runtime release
 *   agda-data/           extracted from agda-data-<version>.zip (includes
 *                        precompiled builtin .agdai, so nothing is compiled)
 *   als-info.json        written last — its presence marks a complete install
 *
 * This is a build-time tool dependency, not the runtime ALS served to the
 * browser (that one is fetched straight into static/als/ by
 * ensure-als-static.mjs during `npm run setup`).
 *
 * Runs from postinstall. Lenient: a failed download only warns, so
 * `npm install` works offline; generate-manifest will error with a hint if
 * the tool is still missing when actually needed.
 *
 * Usage: node scripts/ensure-graph-als.mjs
 */

import { writeFile, mkdir, rm, access, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractZip } from './zip-utils.mjs'
import { GRAPH_ALS_VERSION, alsWasmFilename, alsWasmUrl, agdaDataZipUrl, download } from './als-release.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

async function main() {
  const version = GRAPH_ALS_VERSION
  const alsDir = join(REPO_ROOT, '.deploy-assets', '.als', version)
  if (await exists(join(alsDir, 'als-info.json'))) return

  console.log(`Installing ALS ${version} graph tool into .deploy-assets/.als/${version}/...`)
  const wasmFilename = alsWasmFilename(version)
  await mkdir(alsDir, { recursive: true })

  const wasmPath = join(alsDir, wasmFilename)
  if (!(await exists(wasmPath))) {
    console.log(`  downloading ${alsWasmUrl(version)}`)
    await writeFile(wasmPath, await download(alsWasmUrl(version)))
  }

  const agdaDataDir = join(alsDir, 'agda-data')
  console.log(`  downloading ${agdaDataZipUrl(version)}`)
  const zipPath = join(alsDir, 'agda-data.zip.tmp')
  await writeFile(zipPath, await download(agdaDataZipUrl(version)))
  await rm(agdaDataDir, { recursive: true, force: true })
  await extractZip(zipPath, agdaDataDir)
  await rm(zipPath, { force: true })

  const wasmBytes = (await stat(wasmPath)).size
  await writeFile(join(alsDir, 'als-info.json'),
    JSON.stringify({ wasmFilename, agdaVersion: version, wasmBytes }, null, 2) + '\n')
  console.log('  done')
}

main().catch(err => {
  console.warn(`warning: could not install the ALS graph tool: ${err.message ?? err}`)
  console.warn('(re-run `npm install` online, or generate-manifest will error with a hint when the tool is actually needed)')
})
