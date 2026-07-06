/**
 * Fetches this project's own shipped default library files, places library
 * sources into .deploy-assets/library/<name>/, creates deploy.config.json
 * to point at them, and populates each library's agdaiDir with prebuilt
 * .agdai files from the cache release.
 *
 * ALS runtime assets are NOT handled here: `npm run setup` downloads them
 * from the als-runtime release straight into static/als/ per the versions
 * in deploy.config.json (scripts/ensure-als-static.mjs), and the local
 * graph tool is installed by npm install (scripts/ensure-graph-als.mjs).
 *
 * This is NOT a generic, deploy.config.json-driven downloader — the library
 * set is hardcoded to this project's shipped defaults (stdlib 2.3, cubical
 * 0.9, agda-categories 0.3.0). If you add a library of your own, place
 * files by hand instead; see DEPLOYMENT.md.
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEPLOY_ASSETS = resolve(REPO_ROOT, '.deploy-assets')
const RELEASE = 'https://github.com/jim9292bb/agda-playground/releases/download/cache-2.8.0'

// Hardcoded metadata for this project's shipped defaults.
const SHIPPED_LIBRARIES = [
  {
    name: 'standard-library-2.3',
    agdaLibFile: 'standard-library.agda-lib',
    sourceUrl: 'https://github.com/agda/agda-stdlib/archive/refs/tags/v2.3.zip',
    releaseAssetPrefix: 'stdlib',
    label: 'stdlib',
    version: '2.3',
  },
  {
    name: 'cubical-0.9',
    agdaLibFile: 'cubical.agda-lib',
    sourceUrl: 'https://github.com/agda/cubical/archive/refs/tags/v0.9.zip',
    releaseAssetPrefix: 'cubical',
    label: 'cubical',
    version: '0.9',
  },
  {
    name: 'agda-categories',
    agdaLibFile: 'agda-categories.agda-lib',
    sourceUrl: 'https://github.com/agda/agda-categories/archive/refs/tags/v0.3.0.zip',
    releaseAssetPrefix: 'agda-categories',
    label: 'agda-categories',
    version: '0.3.0',
  },
]

const SHIPPED_PROFILES = [
  {
    label: 'Standard Library v2.3 + Cubical v0.9 (ALS 2.8.0)',
    als: '2.8.0',
    libraries: ['standard-library-2.3', 'cubical-0.9'],
  },
  {
    label: 'Standard Library v2.3 + agda-categories v0.3.0 (ALS 2.8.0)',
    als: '2.8.0',
    libraries: ['standard-library-2.3', 'agda-categories'],
  },
]

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function download(url, destPath) {
  console.log(`  downloading: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(destPath), { recursive: true })
  await writeFile(destPath, buf)
}

async function findSoleSubdir(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const dirs = entries.filter(e => e.isDirectory())
  if (dirs.length !== 1) throw new Error(`expected exactly one subdirectory in ${dir}, found: ${dirs.map(d => d.name).join(', ') || '(none)'}`)
  return join(dir, dirs[0].name)
}

/** Downloads a source archive (GitHub tag zip with a wrapper folder) and extracts into destDir, stripping the wrapper. */
async function fetchSource(url, destDir, workDir) {
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

async function fetchFile(url, destPath) {
  if (await exists(destPath)) {
    console.log(`  already present: ${destPath}`)
    return
  }
  await download(url, destPath)
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
      await fetchSource(lib.sourceUrl, destDir, workDir)
      libsWithPaths.push({ name: lib.name, agdaLibPath: join(destDir, lib.agdaLibFile), releaseAssetPrefix: lib.releaseAssetPrefix })
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
        `${RELEASE}/${lib.releaseAssetPrefix}-agdai.zip`,
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
