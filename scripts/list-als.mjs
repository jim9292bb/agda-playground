/**
 * Lists all ALS builds installed under .deploy-assets/.als/.
 *
 * Usage:
 *   node scripts/list-als.mjs [--hash]
 *
 * --hash  Also prints the SHA-256 hash of the .wasm file (computed live from disk).
 */

import { readdirSync, readFileSync, createReadStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ALS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.deploy-assets/.als')

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', d => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function main() {
  const showHash = process.argv.includes('--hash')

  let dirs
  try {
    dirs = readdirSync(ALS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
  } catch {
    console.log('No ALS builds installed (.deploy-assets/.als/ not found).')
    return
  }

  if (dirs.length === 0) {
    console.log('No ALS builds installed.')
    return
  }

  for (const name of dirs) {
    const infoPath = join(ALS_DIR, name, 'als-info.json')
    let info
    try {
      info = JSON.parse(readFileSync(infoPath, 'utf8'))
    } catch {
      console.log(`${name}   (no als-info.json)`)
      continue
    }

    if (showHash) {
      const wasmPath = join(ALS_DIR, name, info.wasmFilename)
      let hash
      try {
        hash = await sha256File(wasmPath)
      } catch {
        hash = '(wasm file not found)'
      }
      console.log(`${name}   ${info.agdaVersion}   ${hash}`)
    } else {
      console.log(`${name}   ${info.agdaVersion}`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
