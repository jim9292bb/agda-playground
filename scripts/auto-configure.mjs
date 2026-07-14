/**
 * Fetches this project's own shipped default library files, places library
 * sources into .deploy-assets/library/<name>/, creates deploy.config.json
 * to point at them, and populates each library's agdaiDir with prebuilt
 * .agdai files from that library's cache release.
 *
 * ALS runtime assets are NOT handled here: `npm run setup` downloads them
 * from the als-runtime release straight into static/als/ per the versions
 * in deploy.config.json (scripts/ensure-als-static.mjs), and the local
 * graph tool is installed by npm install (scripts/ensure-graph-als.mjs).
 *
 * This is NOT a generic, deploy.config.json-driven downloader — the library
 * set is hardcoded to this project's shipped defaults across all three
 * supported ALS versions (see SHIPPED_PROFILES below). If you add a library
 * of your own, place files by hand instead; see DEPLOYMENT.md.
 *
 * Safe to run repeatedly: each step is skipped if its output already exists.
 *
 * After this script finishes, run `npm run setup` to prepare static/
 * (setup automatically generates dependency-graph manifests first).
 *
 * Usage: node scripts/auto-configure.mjs
 */

import { mkdir, mkdtemp, rm, readdir, cp, access, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { extractZip } from './zip-utils.mjs'
import { getLocalLibraries } from './resolve-deploy-config.mjs'
import { withRetry } from './fetch-retry.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEPLOY_ASSETS = resolve(REPO_ROOT, '.deploy-assets')

// Each shipped library's prebuilt .agdai cache release. Keyed by Agda
// version since .agdai is a version-specific binary format — the same
// library source built with two different Agda versions needs two
// separate cache releases.
const CACHE_RELEASE_2_8_0 = 'https://github.com/jim9292bb/agda-playground/releases/download/cache-2.8.0'
const CACHE_RELEASE_2_7_0_1 = 'https://github.com/jim9292bb/agda-playground/releases/download/cache-2.7.0.1'
const CACHE_RELEASE_2_6_4_3 = 'https://github.com/jim9292bb/agda-playground/releases/download/cache-2.6.4.3'

// Hardcoded metadata for this project's shipped defaults.
const SHIPPED_LIBRARIES = [
  {
    name: 'standard-library-2.3',
    agdaLibFile: 'standard-library.agda-lib',
    sourceUrl: 'https://github.com/agda/agda-stdlib/archive/refs/tags/v2.3.zip',
    cacheRelease: CACHE_RELEASE_2_8_0,
    releaseAssetPrefix: 'stdlib',
    label: 'stdlib',
    version: '2.3',
  },
  {
    name: 'cubical-0.9',
    agdaLibFile: 'cubical.agda-lib',
    sourceUrl: 'https://github.com/agda/cubical/archive/refs/tags/v0.9.zip',
    cacheRelease: CACHE_RELEASE_2_8_0,
    releaseAssetPrefix: 'cubical',
    label: 'cubical',
    version: '0.9',
  },
  {
    name: 'agda-categories',
    agdaLibFile: 'agda-categories.agda-lib',
    sourceUrl: 'https://github.com/agda/agda-categories/archive/refs/tags/v0.3.0.zip',
    cacheRelease: CACHE_RELEASE_2_8_0,
    releaseAssetPrefix: 'agda-categories',
    label: 'agda-categories',
    version: '0.3.0',
  },
  {
    name: 'standard-library-2.2',
    agdaLibFile: 'standard-library.agda-lib',
    sourceUrl: 'https://github.com/agda/agda-stdlib/archive/refs/tags/v2.2.zip',
    cacheRelease: CACHE_RELEASE_2_7_0_1,
    releaseAssetPrefix: 'stdlib',
    label: 'stdlib',
    version: '2.2',
  },
  {
    name: 'cubical-0.8',
    agdaLibFile: 'cubical.agda-lib',
    sourceUrl: 'https://github.com/agda/cubical/archive/refs/tags/v0.8.zip',
    cacheRelease: CACHE_RELEASE_2_7_0_1,
    releaseAssetPrefix: 'cubical',
    label: 'cubical',
    version: '0.8',
    // Cubical.README and Cubical.Talks.EPA2020 both import Everything.agda
    // aggregator modules that don't exist in the raw source tree — cubical's
    // build only generates them via a Haskell script (Everythings.hs /
    // generate-everything.sh) that this project's tooling doesn't run.
    // Both are pure documentation/demo files that nothing else in the
    // library imports (README: a module index + upstream CI "compile
    // everything" target; EPA2020: conference-talk slides), so they're
    // simply removed rather than reproducing cubical's own generation step.
    removeAfterFetch: ['Cubical/README.agda', 'Cubical/Talks/EPA2020.agda'],
  },
  {
    name: 'standard-library-2.1',
    agdaLibFile: 'standard-library.agda-lib',
    sourceUrl: 'https://github.com/agda/agda-stdlib/archive/refs/tags/v2.1.zip',
    cacheRelease: CACHE_RELEASE_2_6_4_3,
    releaseAssetPrefix: 'stdlib',
    label: 'stdlib',
    version: '2.1',
  },
  {
    name: 'cubical-0.7',
    agdaLibFile: 'cubical.agda-lib',
    sourceUrl: 'https://github.com/agda/cubical/archive/refs/tags/v0.7.zip',
    cacheRelease: CACHE_RELEASE_2_6_4_3,
    releaseAssetPrefix: 'cubical',
    label: 'cubical',
    version: '0.7',
    removeAfterFetch: ['Cubical/README.agda', 'Cubical/Talks/EPA2020.agda'], // see cubical-0.8's comment above
  },
]

const SHIPPED_PROFILES = [
  {
    label: 'Standard Library v2.3 + Cubical v0.9 + agda-categories v0.3.0 (ALS 2.8.0)',
    als: '2.8.0',
    libraries: ['standard-library-2.3', 'cubical-0.9', 'agda-categories'],
  },
  {
    label: 'Standard Library v2.2 + Cubical v0.8 (ALS 2.7.0.1)',
    als: '2.7.0.1',
    libraries: ['standard-library-2.2', 'cubical-0.8'],
  },
  {
    label: 'Standard Library v2.1 + Cubical v0.7 (ALS 2.6.4.3)',
    als: '2.6.4.3',
    libraries: ['standard-library-2.1', 'cubical-0.7'],
  },
]

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function download(url, destPath) {
  console.log(`  downloading: ${url}`)
  const buf = await withRetry(async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`)
    return Buffer.from(await res.arrayBuffer())
  }, { label: url })
  await mkdir(dirname(destPath), { recursive: true })
  await writeFile(destPath, buf)
}

async function findSoleSubdir(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const dirs = entries.filter(e => e.isDirectory())
  if (dirs.length !== 1) throw new Error(`expected exactly one subdirectory in ${dir}, found: ${dirs.map(d => d.name).join(', ') || '(none)'}`)
  return join(dir, dirs[0].name)
}

/**
 * Downloads a source archive (GitHub tag zip with a wrapper folder) and
 * extracts into destDir, stripping the wrapper. removeAfterFetch paths
 * (relative to destDir) are deleted once, right after a fresh extraction —
 * for files this project's tooling can't use as-is (see cubical-0.7/0.8's
 * removeAfterFetch in SHIPPED_LIBRARIES).
 */
async function fetchSource(url, destDir, workDir, removeAfterFetch = []) {
  if (await exists(destDir)) {
    console.log(`  already present: ${destDir}`)
    return
  }
  const zipPath = join(workDir, url.split('/').pop())
  await download(url, zipPath)
  const tmp = await mkdtemp(join(workDir, 'extract-'))
  await extractZip(zipPath, tmp)
  const wrapped = await findSoleSubdir(tmp)
  await mkdir(destDir, { recursive: true })
  await cp(wrapped, destDir, { recursive: true })
  for (const relPath of removeAfterFetch) {
    await rm(join(destDir, relPath), { force: true })
  }
}

/** Downloads a flat zip (paths already relative to destDir) and extracts into destDir. */
async function fetchFlatZip(url, destDir, workDir, marker = destDir) {
  if (await exists(marker)) {
    console.log(`  already present: ${marker}`)
    return
  }
  const zipPath = join(workDir, url.split('/').pop())
  await download(url, zipPath)
  await mkdir(destDir, { recursive: true })
  await extractZip(zipPath, destDir)
}

async function ensureDeployConfig(libsWithPaths) {
  const configPath = join(REPO_ROOT, 'deploy.config.json')
  if (await exists(configPath)) {
    console.log(`  already present: deploy.config.json (leaving as-is — delete it to regenerate)`)
    return
  }
  const libMap = new Map(libsWithPaths.map(l => [l.name, l]))
  const libMeta = new Map(SHIPPED_LIBRARIES.map(l => [l.name, l]))
  const profiles = SHIPPED_PROFILES.map(profile => ({
    label: profile.label,
    als: profile.als,
    libraries: profile.libraries.map(libName => {
      const { agdaLibPath } = libMap.get(libName)
      const { label, version } = libMeta.get(libName)
      return { agdaLibPath, label, version, agdaiDir: `.deploy-assets/auto/agdai/${libName}` }
    }),
  }))
  await writeFile(configPath, JSON.stringify({ profiles }, null, 2) + '\n')
  console.log(`  created deploy.config.json`)
}

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), 'auto-configure-'))
  try {
    console.log("Fetching this project's own shipped default assets...")

    // 1. Download library source archives
    const libsWithPaths = []
    for (const lib of SHIPPED_LIBRARIES) {
      const destDir = join(DEPLOY_ASSETS, 'library', lib.name)
      await fetchSource(lib.sourceUrl, destDir, workDir, lib.removeAfterFetch)
      libsWithPaths.push({
        name: lib.name,
        agdaLibPath: join(destDir, lib.agdaLibFile),
        cacheRelease: lib.cacheRelease,
        releaseAssetPrefix: lib.releaseAssetPrefix,
      })
    }

    // 2. Create deploy.config.json if absent (points at the downloaded sources)
    await ensureDeployConfig(libsWithPaths)

    // 3. Resolve cache dirs (getLocalLibraries re-reads deploy.config.json and assigns IDs)
    const resolvedLibs = getLocalLibraries()
    const libByName = new Map(resolvedLibs.map(l => [l.name, l]))

    // 4. Download prebuilt .agdai into each library's agdaiDir
    for (const lib of libsWithPaths) {
      const resolved = libByName.get(lib.name)
      if (!resolved?.agdaiDir) {
        console.warn(`  warning: "${lib.name}" not in deploy.config.json or has no agdaiDir — skipping cache download`)
        continue
      }
      await mkdir(resolved.agdaiDir, { recursive: true })

      await fetchFlatZip(
        `${lib.cacheRelease}/${lib.releaseAssetPrefix}-agdai.zip`,
        resolved.agdaiDir,
        workDir,
        join(resolved.agdaiDir, '_build'),
      )
    }

    console.log('Done. Run `npm run setup` next to prepare static/ for serving.')
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

main().catch(err => { console.error(err); process.exit(1) })
