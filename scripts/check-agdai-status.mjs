/**
 * Shows, per profile, whether each library's configured agdaiDir has a
 * prebuilt .agdai cache ready FOR THAT PROFILE'S OWN als VERSION.
 *
 * .agdai is a version-specific binary format — build-agdai writes its
 * output to agdaiDir/_build/<numeric agda version>/agda/..., matching
 * exactly the `als` value in deploy.config.json (e.g. "2.8.0"). A cache
 * built for one Agda version is silently unusable (not wrong, just
 * ignored — Agda falls back to recompiling from source) for a profile
 * configured with a different `als`, so this checks
 * agdaiDir/_build/<profile.als>/ specifically, not just bare _build/.
 *
 * Reads deploy.config.json's profiles directly (not getLocalLibraries(),
 * which deduplicates by agdaLibPath) so that two profiles sharing a
 * library but pointing at two different agdaiDir values are each shown
 * against their own configured directory, not silently collapsed to one.
 *
 * Useful before running `npm run setup` to know what is ready.
 *
 * Usage: node scripts/check-agdai-status.mjs
 */

import { readFileSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { REPO_ROOT, readDeployConfig } from './resolve-deploy-config.mjs'
import { parseAgdaLibName } from './agda-lib-utils.mjs'

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

function libraryName(lib) {
  try {
    return parseAgdaLibName(readFileSync(lib.agdaLibPath, 'utf8'))
  } catch {
    return lib.label ?? lib.agdaLibPath
  }
}

async function main() {
  const { profiles } = readDeployConfig()

  if (profiles.length === 0) {
    console.log('No profiles configured in deploy.config.json.')
    return
  }

  for (const [i, profile] of profiles.entries()) {
    if (i > 0) console.log()
    console.log(profile.label)
    const names = profile.libraries.map(libraryName)
    const nameWidth = Math.max(...names.map(n => n.length))
    for (const [j, lib] of profile.libraries.entries()) {
      const name = names[j].padEnd(nameWidth)
      if (!lib.agdaiDir) {
        console.log(`  ${name}  (no agdaiDir configured)`)
        continue
      }
      const versionDir = join(resolve(REPO_ROOT, lib.agdaiDir), '_build', profile.als)
      const hasCache = await exists(versionDir)
      const cache = hasCache
        ? `✓ cache (${profile.als})`
        : `✗ cache for als ${profile.als} (run \`npm run build-agdai\` with that Agda version)`
      console.log(`  ${name}  ${cache}`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
