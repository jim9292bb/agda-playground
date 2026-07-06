/**
 * Resolves deploy.config.json into validated, ready-to-use library and
 * ALS-version records that all deploy-time scripts consume.
 *
 * deploy.config.json  (gitignored, created from deploy.config.example.json)
 *                     — profiles, ALS version info, and per-library
 *                     { agdaLibPath, agdaiDir }. Also imported by the
 *                     TypeScript bundle (interface.ts) at build time.
 *                     scripts/ensure-deploy-config.mjs copies the
 *                     example into place automatically on a fresh clone.
 */

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { parseAgdaLibName } from './agda-lib-utils.mjs'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── deploy.config.json ────────────────────────────────────────────────────────

function readDeployConfig() {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, 'deploy.config.json'), 'utf8'))
  } catch {
    return { profiles: [], libraries: [] }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Deduplicated ALS versions referenced by any configured profile. The `als`
 * field is a bare Agda version number (e.g. "2.8.0"); the WASM filename is
 * derived from it (als-<version>.wasm — the als-runtime release convention).
 * wasmBytes is read from the downloaded file under static/als/<version>/
 * when present (used by the UI download progress bar; optional).
 * Returns { version, wasmFilename, wasmBytes } records.
 */
export function getSelectedAlsVersions() {
  const { profiles } = readDeployConfig()
  const seen = new Set()
  const result = []
  for (const profile of profiles) {
    const { als } = profile
    if (!als || seen.has(als)) continue
    seen.add(als)
    const wasmFilename = `als-${als}.wasm`
    let wasmBytes
    try {
      wasmBytes = statSync(join(REPO_ROOT, 'static', 'als', als, wasmFilename)).size
    } catch {}
    result.push({ version: als, wasmFilename, wasmBytes })
  }
  return result
}

/**
 * All libraries that appear in any profile whose .agda-lib file is readable.
 * Each entry has:
 *   name        — the .agda-lib `name:` value (identifier + static-asset key)
 *   agdaLibPath — absolute OS path to the .agda-lib file (primary key in profiles)
 *   agdaiDir    — absolute path to the .agdai directory, or null if not configured.
 *                 Presence of agdaiDir means .agdai prefetching is enabled for this
 *                 library. Relative paths in deploy.config.json are resolved from
 *                 REPO_ROOT.
 *
 * When the same agdaLibPath appears in multiple profiles with different agdaiDir
 * values, the first one encountered is used and a warning is emitted.
 */
export function getLocalLibraries() {
  const config = readDeployConfig()

  // Collect agdaLibPath entries from all profiles; first agdaiDir wins
  const profileLibsByPath = new Map()
  for (const profile of config.profiles) {
    for (const lib of profile.libraries) {
      if (!lib.agdaLibPath) continue
      const existing = profileLibsByPath.get(lib.agdaLibPath)
      if (existing) {
        if (lib.agdaiDir && existing.agdaiDir && lib.agdaiDir !== existing.agdaiDir)
          console.warn(`warning: "${lib.agdaLibPath}" has different agdaiDir in multiple profiles — using "${existing.agdaiDir}"`)
        if (!existing.agdaiDir && lib.agdaiDir) existing.agdaiDir = lib.agdaiDir
      } else {
        profileLibsByPath.set(lib.agdaLibPath, { agdaiDir: lib.agdaiDir ?? null })
      }
    }
  }

  const result = []
  for (const [agdaLibPath, libInfo] of profileLibsByPath) {
    let src
    try { src = readFileSync(agdaLibPath, 'utf8') } catch { continue }
    const name = parseAgdaLibName(src)
    if (!name) continue
    result.push({
      name,
      agdaLibPath,
      agdaiDir: libInfo.agdaiDir ? resolve(REPO_ROOT, libInfo.agdaiDir) : null,
    })
  }

  return result
}
