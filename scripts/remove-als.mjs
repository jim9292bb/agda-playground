/**
 * Removes an installed ALS build.
 *
 * Usage:
 *   node scripts/remove-als.mjs <als-name>
 */

import { rm, access, readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.deploy-assets/.als')

async function listInstalled() {
  try {
    const entries = await readdir(ALS_DIR, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort()
  } catch {
    return []
  }
}

async function main() {
  const name = process.argv[2]

  if (!name) {
    const installed = await listInstalled()
    console.error('Error: <als-name> is required.')
    console.error('')
    if (installed.length > 0) {
      console.error('Installed ALS builds:')
      for (const n of installed) {
        let version = ''
        try {
          const info = JSON.parse(await readFile(join(ALS_DIR, n, 'als-info.json'), 'utf8'))
          version = `   ${info.agdaVersion}`
        } catch {}
        console.error(`  ${n}${version}`)
      }
    } else {
      console.error('No ALS builds installed.')
    }
    console.error('')
    console.error('Usage: npm run remove-als -- <als-name>')
    process.exit(1)
  }

  const target = join(ALS_DIR, name)
  try {
    await access(target)
  } catch {
    const installed = await listInstalled()
    console.error(`Error: "${name}" is not installed.`)
    if (installed.length > 0) {
      console.error(`Installed: ${installed.join(', ')}`)
    }
    process.exit(1)
  }

  await rm(target, { recursive: true })
  console.log(`Removed .deploy-assets/.als/${name}/`)
}

main().catch(err => { console.error(err); process.exit(1) })
