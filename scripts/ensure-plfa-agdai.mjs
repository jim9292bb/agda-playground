/**
 * Fetches the prebuilt `.agdai` cache for the PLFA Notebook deploy profile
 * from this repo's `plfa-agdai-v1` release (see plfa-agdai-release.mjs for
 * provenance) straight into whatever agdaiDir each matching library is
 * configured to use in deploy.config.json.
 *
 * Matches by the agdaiDir's own basename (e.g. "standard-library-2.1.1",
 * "plfa") against PLFA_AGDAI_ASSETS, rather than hardcoding a path, so it
 * still works if deploy.config.json ever points agdaiDir somewhere else.
 * Skipped per-library if:
 *   - deploy.config.json has no library whose agdaiDir basename matches, or
 *   - that agdaiDir already exists and is non-empty (assumed already built
 *     or already fetched -- this script never overwrites).
 *
 * Non-fatal on any single library's failure (network error, missing
 * release asset, etc.) -- prefetching is an optimization, not a
 * requirement; PLFA Notebook still works without it, just with a slow
 * first Load (Agda recompiles from source in-browser). Mirrors
 * print-required-files.mjs's existing "optional, prefetch disabled"
 * framing for agdaiDir.
 *
 * Usage: node scripts/ensure-plfa-agdai.mjs
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { readDeployConfig, REPO_ROOT } from './resolve-deploy-config.mjs'
import { PLFA_AGDAI_ASSETS, plfaAgdaiZipUrl, download } from './plfa-agdai-release.mjs'
import { extractZip } from './zip-utils.mjs'

async function isNonEmptyDir(path) {
  try {
    return (await readdir(path)).length > 0
  } catch {
    return false
  }
}

async function main() {
  const configuredAgdaiDirs = new Set()
  for (const profile of readDeployConfig().profiles) {
    for (const lib of profile.libraries) {
      if (lib.agdaiDir) configuredAgdaiDirs.add(lib.agdaiDir)
    }
  }

  for (const asset of PLFA_AGDAI_ASSETS) {
    const match = [...configuredAgdaiDirs].find(dir => basename(dir) === asset.agdaiDirName)
    if (!match) {
      console.log(`ensure-plfa-agdai: no configured agdaiDir named "${asset.agdaiDirName}" — skipping ${asset.zip}`)
      continue
    }

    const targetDir = join(REPO_ROOT, match)
    if (await isNonEmptyDir(targetDir)) {
      console.log(`ensure-plfa-agdai: ${match} already present — skipping ${asset.zip}`)
      continue
    }

    const tmpZip = join(REPO_ROOT, `.plfa-agdai-download-${asset.agdaiDirName}.zip`)
    try {
      const url = plfaAgdaiZipUrl(asset.zip)
      console.log(`ensure-plfa-agdai: downloading ${url}`)
      await writeFile(tmpZip, await download(url))
      await mkdir(targetDir, { recursive: true })
      const count = await extractZip(tmpZip, targetDir)
      console.log(`ensure-plfa-agdai: extracted ${count} files into ${match}`)
    } catch (err) {
      console.warn(`ensure-plfa-agdai: failed to fetch/extract ${asset.zip} (${err.message ?? err}) — PLFA Notebook will still work, just with a slower first Load`)
    } finally {
      await rm(tmpZip, { force: true })
    }
  }
}

main()
