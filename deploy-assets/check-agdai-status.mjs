/**
 * Shows which libraries in deploy.config.json have prebuilt .agdai cache
 * and/or a manifest in deploy-assets/.cache/.
 *
 * Useful before running `npm run setup` to know what is ready.
 *
 * Usage: node deploy-assets/check-agdai-status.mjs
 */

import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { getLocalLibraries } from './resolve-deploy-config.mjs'

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function main() {
  const libs = getLocalLibraries()

  if (libs.length === 0) {
    console.log('No libraries configured in deploy.config.json.')
    return
  }

  const rows = await Promise.all(libs.map(async lib => ({
    name: lib.name,
    hasManifest: await exists(join(lib.cacheDir, 'agdai-manifest.json')),
    hasCache: await exists(join(lib.cacheDir, '_build')),
    agdaiDisabled: !lib.useAgdai,
  })))

  const nameWidth = Math.max(...rows.map(r => r.name.length))
  for (const r of rows) {
    const name = r.name.padEnd(nameWidth)
    const manifest = r.hasManifest ? '✓ manifest' : '✗ manifest'
    const cache = r.hasCache ? '✓ cache' : '✗ cache'
    const disabled = r.agdaiDisabled ? '  (agdai disabled)' : ''
    console.log(`${name}  ${manifest}  ${cache}${disabled}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
