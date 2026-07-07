/**
 * Content hash of a directory tree: sha256 over every file's relative path
 * and content, in sorted-path order (so the result never depends on
 * filesystem enumeration order, only on actual content).
 *
 * Used to key static/agdai/<key>/ off an agdaiDir's real content instead of
 * a library name or path string, so a rebuilt-in-place agdaiDir gets a new
 * key (correct cache invalidation) and an unchanged agdaiDir keeps the same
 * key across rebuilds (stable caching) — see scripts/resolve-deploy-config.mjs's
 * getAllAgdaiDirs().
 */

import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

async function listFilesSorted(root) {
  const out = []
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  await walk(root)
  out.sort()
  return out
}

/** @param {string} dirPath - absolute path to hash. @returns {Promise<string>} 12-hex-char content hash. */
export async function hashDir(dirPath) {
  const files = await listFilesSorted(dirPath)
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(relative(dirPath, file))
    hash.update('\0')
    hash.update(await readFile(file))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 12)
}
