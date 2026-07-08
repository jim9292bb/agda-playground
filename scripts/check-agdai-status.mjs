/**
 * Shows which libraries in deploy.config.json have prebuilt .agdai cache
 * and/or a manifest in their configured agdaiDir, and — when both are
 * present — the content-hash key (scripts/hash-dir.mjs) that agdaiDir will
 * become under static/agdai/ (see scripts/build-static-assets.mjs).
 *
 * Useful before running `npm run setup` to know what is ready.
 *
 * Usage: node scripts/check-agdai-status.mjs
 */

import { access } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { getLocalLibraries, REPO_ROOT } from './resolve-deploy-config.mjs'
import { hashDir } from './hash-dir.mjs'

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function main() {
  const libs = getLocalLibraries()

  if (libs.length === 0) {
    console.log('No libraries configured in deploy.config.json.')
    return
  }

  const rows = await Promise.all(libs.map(async lib => {
    if (!lib.agdaiDir) return { name: lib.name, agdaiDir: null, hasManifest: false, hasCache: false, agdaiKey: null }
    const hasManifest = await exists(join(lib.agdaiDir, 'agdai-manifest.json'))
    const hasCache = await exists(join(lib.agdaiDir, '_build'))
    return {
      name: lib.name,
      agdaiDir: relative(REPO_ROOT, lib.agdaiDir),
      hasManifest,
      hasCache,
      agdaiKey: (hasManifest && hasCache) ? await hashDir(lib.agdaiDir) : null,
    }
  }))

  const nameWidth = Math.max(...rows.map(r => r.name.length))
  for (const r of rows) {
    const name = r.name.padEnd(nameWidth)
    if (!r.agdaiDir) {
      console.log(`${name}  (no agdaiDir configured)`)
      continue
    }
    const manifest = r.hasManifest ? '✓ manifest' : '✗ manifest (run `npm run setup`)'
    const cache = r.hasCache ? '✓ cache' : '✗ cache (run `npm run build-agdai`)'
    const key = r.agdaiKey ? `  -> static/agdai/${r.agdaiKey}/` : ''
    console.log(`${name}  ${manifest}  ${cache}  (${r.agdaiDir})${key}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
