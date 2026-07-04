/**
 * Removes the prebuilt .agdai cache and dependency-graph manifest for a library.
 *
 * Usage:
 *   node scripts/remove-agdai.mjs <path/to/lib.agda-lib>
 */

import { rm, access } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { getLocalLibraries, REPO_ROOT } from './resolve-deploy-config.mjs'

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

async function main() {
  const libFile = process.argv[2]
  const libs = getLocalLibraries()

  if (!libFile) {
    console.error('Error: <path/to/lib.agda-lib> is required.')
    console.error('')
    if (libs.length > 0) {
      console.error('Configured libraries:')
      const nameWidth = Math.max(...libs.map(l => l.name.length))
      for (const lib of libs) {
        if (!lib.agdaiDir) {
          console.error(`  ${lib.name.padEnd(nameWidth)}  (no agdaiDir configured)`)
          continue
        }
        const hasManifest = await exists(join(lib.agdaiDir, 'agdai-manifest.json'))
        const hasCache = await exists(join(lib.agdaiDir, '_build'))
        const manifest = hasManifest ? '✓ manifest' : '✗ manifest'
        const cache = hasCache ? '✓ cache' : '✗ cache'
        console.error(`  ${lib.name.padEnd(nameWidth)}  ${manifest}  ${cache}  (${relative(REPO_ROOT, lib.agdaiDir)})`)
      }
    } else {
      console.error('No libraries configured in deploy.config.json.')
    }
    console.error('')
    console.error('Usage: npm run remove-agdai -- <path/to/lib.agda-lib>')
    process.exit(1)
  }

  const lib = libs.find(l => l.agdaLibPath === libFile)
  if (!lib) {
    const paths = libs.map(l => l.agdaLibPath).join('\n  ') || '(none configured)'
    console.error(`Error: "${libFile}" not found in deploy.config.json.`)
    console.error(`Configured agdaLibPath values:\n  ${paths}`)
    process.exit(1)
  }

  if (!lib.agdaiDir) {
    console.log(`"${lib.name}" has no agdaiDir configured — nothing to remove.`)
    return
  }

  const manifest = join(lib.agdaiDir, 'agdai-manifest.json')
  const build = join(lib.agdaiDir, '_build')
  let removed = false

  if (await exists(manifest)) {
    await rm(manifest)
    console.log(`Removed manifest for "${lib.name}"`)
    removed = true
  }
  if (await exists(build)) {
    await rm(build, { recursive: true })
    console.log(`Removed cache for "${lib.name}"`)
    removed = true
  }

  if (!removed) {
    console.log(`Nothing to remove for "${lib.name}" (no manifest or cache found in ${relative(REPO_ROOT, lib.agdaiDir)}).`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
