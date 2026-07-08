/**
 * Builds static/{library,agdai}/ — the place that turns "files a deployer
 * placed or generated" into "what the browser runtime actually fetches".
 *
 * static/library/<name>.zip — one per selected library (from
 *   deploy.config.json), zipped from agdaLibPath's parent directory,
 *   wrapped under a folder named <name> — reproducing the shape of a GitHub
 *   tag-archive zip so the browser's existing client-side unzip (which
 *   strips that wrapper) needs no change.
 *
 * static/agdai/<agdaiKey>/ — one per *distinct agdaiDir value* referenced by
 *   any profile (see scripts/resolve-deploy-config.mjs's getAllAgdaiDirs()),
 *   not one per library name — two profiles pointing the same library at two
 *   different agdaiDir values correctly get two separate, isolated
 *   directories here instead of colliding. agdaiKey is a content hash of the
 *   agdaiDir's files (scripts/hash-dir.mjs), so a rebuilt-in-place agdaiDir
 *   gets a new key (correct cache invalidation) while an unchanged one keeps
 *   serving from the same URL across rebuilds (stable caching).
 *   - agdaiDir/_build/ is copied to static/agdai/<agdaiKey>/_build/.
 *   - agdaiDir/agdai-manifest.json is copied to
 *     static/agdai/<agdaiKey>/agdai-manifest.json.
 *     If absent, prefetching for that agdaiDir is simply disabled at runtime
 *     (src/lib/agda/prefetch.js degrades gracefully per library).
 *
 * ALS runtime assets (static/als/<version>/) are not built here — they are
 * downloaded ready-to-serve from the als-runtime release by
 * scripts/ensure-als-static.mjs.
 *
 * static/agdai/ is wiped and rebuilt from scratch on every run (unlike
 * static/library/, whose <name>.zip filenames are stable, and static/als/,
 * which is deliberately skip-if-present to avoid re-downloading large wasm
 * files): since agdaiKey is a content hash, a rebuilt agdaiDir produces a
 * new key and leaves its old static/agdai/<oldKey>/ directory permanently
 * orphaned — nothing else would ever clean it up otherwise.
 *
 * Run via `npm run setup` (scripts/setup-assets.sh), after
 * scripts/print-required-files.mjs has confirmed everything needed
 * is present.
 */

import { cp, mkdir, rm, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { zipDirectory } from './zip-utils.mjs'
import { REPO_ROOT, getLocalLibraries, getAllAgdaiDirs } from './resolve-deploy-config.mjs'

const STATIC = join(REPO_ROOT, 'static')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  await mkdir(join(STATIC, 'library'), { recursive: true })
  await rm(join(STATIC, 'agdai'), { recursive: true, force: true })
  await mkdir(join(STATIC, 'agdai'), { recursive: true })

  for (const lib of getLocalLibraries()) {
    const libSrcRoot = dirname(lib.agdaLibPath)

    console.log(`[${lib.name}] zipping source into static/library/${lib.name}.zip...`)
    await zipDirectory(libSrcRoot, join(STATIC, 'library', `${lib.name}.zip`), {
      prefix: lib.name,
      exclude: ['.git', '_build'],
    })
  }

  for (const { agdaiDirAbs, agdaiKey } of await getAllAgdaiDirs()) {
    const buildDir = join(agdaiDirAbs, '_build')
    if (await exists(buildDir)) {
      console.log(`[${agdaiKey}] copying prebuilt .agdai cache into static/agdai/${agdaiKey}/_build/...`)
      await cp(buildDir, join(STATIC, 'agdai', agdaiKey, '_build'), { recursive: true })
    }

    const manifestSrc = join(agdaiDirAbs, 'agdai-manifest.json')
    if (await exists(manifestSrc)) {
      console.log(`[${agdaiKey}] copying agdai-manifest.json...`)
      await mkdir(join(STATIC, 'agdai', agdaiKey), { recursive: true })
      await cp(manifestSrc, join(STATIC, 'agdai', agdaiKey, 'agdai-manifest.json'))
    } else {
      console.log(`[${agdaiKey}] no agdai-manifest.json in ${agdaiDirAbs} — prefetching disabled (run \`npm run generate-manifest\`).`)
    }
  }

  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
