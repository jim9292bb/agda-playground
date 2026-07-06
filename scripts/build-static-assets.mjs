/**
 * Builds static/{library,agdai}/ from each library's agdaiDir (for .agdai
 * and manifests) and from each library's OS-path source tree (for source
 * zips) — the place that turns "files a deployer placed or generated" into
 * "what the browser runtime actually fetches".
 *
 * Per selected library (from deploy.config.json):
 *   - zips the library's source tree (from agdaLibPath's parent directory)
 *     into static/library/<name>.zip, wrapped under a folder named <name>
 *     — reproducing the shape of a GitHub tag-archive zip so the browser's
 *     existing client-side unzip (which strips that wrapper) needs no change.
 *   - if agdaiDir/_build/ exists, copies it into static/agdai/<name>/_build/.
 *   - if agdaiDir/agdai-manifest.json exists, copies it to
 *     static/agdai/<name>/agdai-manifest.json.
 *     If absent, prefetching for that library is simply disabled at runtime
 *     (src/lib/agda/prefetch.js degrades gracefully per library).
 *
 * ALS runtime assets (static/als/<version>/) are not built here — they are
 * downloaded ready-to-serve from the als-runtime release by
 * scripts/ensure-als-static.mjs.
 *
 * Run via `npm run setup` (scripts/setup-assets.sh), after
 * scripts/print-required-files.mjs has confirmed everything needed
 * is present.
 */

import { cp, mkdir, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { zipDirectory } from './zip-utils.mjs'
import { REPO_ROOT, getLocalLibraries } from './resolve-deploy-config.mjs'

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
  await mkdir(join(STATIC, 'agdai'), { recursive: true })

  for (const lib of getLocalLibraries()) {
    const libSrcRoot = dirname(lib.agdaLibPath)

    console.log(`[${lib.name}] zipping source into static/library/${lib.name}.zip...`)
    await zipDirectory(libSrcRoot, join(STATIC, 'library', `${lib.name}.zip`), {
      prefix: lib.name,
      exclude: ['.git', '_build'],
    })

    if (lib.agdaiDir) {
      const buildDir = join(lib.agdaiDir, '_build')
      if (await exists(buildDir)) {
        console.log(`[${lib.name}] copying prebuilt .agdai cache into static/agdai/${lib.name}/_build/...`)
        await cp(buildDir, join(STATIC, 'agdai', lib.name, '_build'), { recursive: true })
      }

      const manifestSrc = join(lib.agdaiDir, 'agdai-manifest.json')
      if (await exists(manifestSrc)) {
        console.log(`[${lib.name}] copying agdai-manifest.json...`)
        await mkdir(join(STATIC, 'agdai', lib.name), { recursive: true })
        await cp(manifestSrc, join(STATIC, 'agdai', lib.name, 'agdai-manifest.json'))
      } else {
        console.log(`[${lib.name}] no agdai-manifest.json in agdaiDir — prefetching disabled (run \`npm run generate-manifest\`).`)
      }
    }
  }

  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
