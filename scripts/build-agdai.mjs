/**
 * Compiles .agdai files for a library. Standalone: does not read or write
 * deploy.config.json.
 *
 *   node scripts/build-agdai.mjs <lib-file> <agdai-dir> [--libraries-file <path>] [--agda-bin <path>]
 *
 * <lib-file>: path to the library's .agda-lib file.
 * <agdai-dir>: created if missing, then populated with a _build/
 *   subdirectory (agda's own build output, copied in as-is) — .agdai files
 *   do NOT land directly in <agdai-dir> itself, they're one level deeper
 *   at <agdai-dir>/_build/<version>/agda/.... This is the exact path meant
 *   to be set as a deploy.config.json library entry's own agdaiDir.
 * --libraries-file: a file listing one .agda-lib path per line, passed to
 *   agda as --library-file (for resolving the library's own dependencies).
 *   Omit to let agda fall back to ~/.agda/libraries.
 * --agda-bin: path to the agda binary (default: "agda" on PATH).
 *
 * Builds with native agda directly in the library's source directory:
 *   agda ≥ 2.8.0 — agda --build-library (single command)
 *   agda < 2.8.0 — agda --interaction-json + Cmd_load per source vertex;
 *                  dependency graph is computed in memory, not written to file
 *
 * After building, copies the library's _build/ into agdai-dir. Does NOT
 * generate agdai-manifest.json — that's `npm run setup`'s job
 * (scripts/generate-manifest.mjs, run automatically via its presetup
 * hook), which regenerates manifests for every configured library anyway;
 * generating one here too would just be redundant duplicate work.
 */

import { readFile, mkdir, cp, rm, access } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { parseAgdaLibInclude, parseAgdaLibName } from './agda-lib-utils.mjs'
import { buildGraph, AGDA_FILE_EXTENSIONS } from './generate-manifest.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = { agdaBin: 'agda', positional: [], librariesFile: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--agda-bin') {
      args.agdaBin = argv[++i]
    } else if (argv[i] === '--libraries-file') {
      args.librariesFile = argv[++i]
    } else if (argv[i].startsWith('--')) {
      console.error(`unknown argument: ${argv[i]}`)
      process.exit(1)
    } else {
      args.positional.push(argv[i])
    }
  }
  return args
}

function parseAgdaVersion(str) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(str?.trim() ?? '')
  if (!m) return null
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])]
}

function versionGte(v, [major, minor, patch]) {
  if (v[0] !== major) return v[0] > major
  if (v[1] !== minor) return v[1] > minor
  return v[2] >= patch
}

/**
 * Resolves a module name to its real file, trying every extension Agda
 * recognizes (not just `.agda`) -- a literate file (e.g. PLFA's `.lagda.md`
 * sources) sent to Cmd_load under a fabricated `.agda` path that doesn't
 * exist doesn't error, it just hangs forever waiting for a response that
 * never comes (confirmed empirically), so this must check the filesystem
 * rather than assume the extension.
 */
async function moduleNameToPath(mod, includeDir) {
  const base = mod.split('.').join(sep)
  for (const ext of AGDA_FILE_EXTENSIONS) {
    const candidate = join(includeDir, base + ext)
    try {
      await access(candidate)
      return candidate
    } catch { /* try the next extension */ }
  }
  throw new Error(`no source file found for module "${mod}" under ${includeDir} (tried: ${AGDA_FILE_EXTENSIONS.join(', ')})`)
}

function findSourceVertices(graph) {
  const hasIncoming = new Set()
  for (const deps of Object.values(graph))
    for (const dep of deps)
      if (dep in graph) hasIncoming.add(dep)
  return Object.keys(graph).filter(mod => !hasIncoming.has(mod))
}

/** `--build-library` takes no argument — it builds the .agda-lib found in
 *  the current directory, so cwd must be the library's own source root.
 *  libraryFile: path to a libraries listing file for agda's --library-file,
 *  or null to omit the flag (agda falls back to ~/.agda/libraries). */
function buildWithBuildLibrary(lib, agdaBin, libraryFile) {
  return new Promise((resolve, reject) => {
    console.log(`[${lib.name}] running agda --build-library...`)
    const proc = spawn(agdaBin, [
      '--build-library',
      ...(libraryFile ? [`--library-file=${libraryFile}`] : []),
    ], { cwd: dirname(lib.agdaLibPath), stdio: ['ignore', 'inherit', 'inherit'] })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`agda --build-library exited ${code} for "${lib.name}"`))
      else resolve()
    })
  })
}

async function buildWithCmdLoad(lib, agdaBin, graph, includeDir, libraryFile) {
  const sourceVertices = findSourceVertices(graph)
  console.log(`[${lib.name}] ${sourceVertices.length} source vertices to Cmd_load (covers all ${Object.keys(graph).length} modules)`)

  const proc = spawn(agdaBin, [
    '--interaction-json',
    ...(libraryFile ? [`--library-file=${libraryFile}`] : []),
  ], {
    cwd: includeDir,
  })
  let buf = ''
  let pending = null
  proc.stdout.on('data', d => {
    buf += d
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!pending) continue
      if (line.includes('"kind":"Error"')) {
        pending.failed = true
        try {
          const message = JSON.parse(line.slice(line.indexOf('{'))).info?.error?.message
          if (message) pending.errors.push(message)
        } catch { /* fall back to no extracted message below */ }
      }
      if (line.includes('"kind":"Status"')) {
        pending.statusCount++
        if (pending.statusCount >= 2) {
          const p = pending; pending = null; p.done()
        }
      }
    }
  })
  proc.on('error', err => { throw err })

  async function loadOne(mod) {
    const path = await moduleNameToPath(mod, includeDir)
    return new Promise((resolve, reject) => {
      const entry = { failed: false, statusCount: 0, errors: [] }
      entry.done = () => (entry.failed
        ? reject(new Error(`Cmd_load reported an error for ${mod}:\n${entry.errors.length > 0 ? entry.errors.join('\n') : '(no error message captured — check the raw --interaction-json output)'}`))
        : resolve())
      pending = entry
      proc.stdin.write(`IOTCM "${path}" NonInteractive Direct (Cmd_load "${path}" [])\n`)
    })
  }

  const t0 = performance.now()
  let count = 0
  for (const mod of sourceVertices) {
    await loadOne(mod)
    if (++count % 50 === 0) console.log(`  ${count}/${sourceVertices.length}...`)
  }
  proc.stdin.write('IOTCM "" NonInteractive Direct Cmd_exit\n')
  proc.stdin.end()
  console.log(`[${lib.name}] Cmd_load done: ${sourceVertices.length} vertices, ${((performance.now() - t0) / 1000).toFixed(1)}s`)
}

/** libraryFile: path to a libraries listing file for agda's --library-file,
 *  or null to omit the flag (agda falls back to ~/.agda/libraries). */
async function buildAgdai(lib, agdaBin, libraryFile) {
  const versionStr = spawnSync(agdaBin, ['--numeric-version'], { encoding: 'utf8' }).stdout?.trim()
  const agdaVersion = parseAgdaVersion(versionStr)
  if (!agdaVersion) throw new Error(`could not determine agda version from "${agdaBin} --numeric-version": ${versionStr}`)
  // Log the real --numeric-version output, not agdaVersion.join('.') — parseAgdaVersion only
  // captures major.minor.patch (all versionGte() below needs), so a 4-component version like
  // "2.7.0.1" would otherwise be silently displayed as the wrong, truncated "2.7.0".
  console.log(`[${lib.name}] agda version: ${versionStr}`)

  const agdaLibSrc = await readFile(lib.agdaLibPath, 'utf8')
  const include = parseAgdaLibInclude(agdaLibSrc)
  const libSrcRoot = dirname(lib.agdaLibPath)
  const includeDir = include ? join(libSrcRoot, include) : libSrcRoot

  await mkdir(lib.agdaiDir, { recursive: true })

  if (versionGte(agdaVersion, [2, 8, 0])) {
    await buildWithBuildLibrary(lib, agdaBin, libraryFile)
  } else {
    // Compute dependency graph in memory to find source vertices for Cmd_load.
    const graph = await buildGraph(lib, agdaBin)
    await buildWithCmdLoad(lib, agdaBin, graph, includeDir, libraryFile)
  }

  // Scoped to _build/<versionStr>, not the whole _build/ tree: Agda namespaces
  // its own build cache by version inside the library's source directory, so
  // libSrcRoot/_build accumulates a subfolder per Agda binary ever used to
  // compile this same checked-out source (e.g. from an earlier run against a
  // different --agda-bin). Copying the whole tree would carry every stale
  // version's .agdai files into agdaiDir/_build alongside the one just
  // built -- this happened for real (standard-library-2.1.1 and -2.2 both
  // shipped 2.6.4.3 and 2.8.0 leftovers bundled with their 2.7.0.1 release
  // zips) and inflated those release assets by ~35%.
  const srcBuild = join(libSrcRoot, '_build', versionStr)
  const destBuild = join(lib.agdaiDir, '_build', versionStr)
  await rm(destBuild, { recursive: true, force: true })
  await cp(srcBuild, destBuild, { recursive: true })
  console.log(`[${lib.name}] .agdai written to ${relative(REPO_ROOT, dirname(destBuild))}/`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.positional.length !== 2) {
    console.error('Usage: node scripts/build-agdai.mjs <lib-file> <agdai-dir> [--libraries-file <path>] [--agda-bin <path>]')
    process.exit(1)
  }

  const [libFileArg, agdaiDirArg] = args.positional
  const agdaLibPath = resolve(libFileArg)
  const agdaiDir = resolve(agdaiDirArg)
  const agdaLibSrc = await readFile(agdaLibPath, 'utf8')
  const name = parseAgdaLibName(agdaLibSrc) ?? agdaLibPath
  const lib = { name, agdaLibPath, agdaiDir }

  const libraryFile = args.librariesFile ? resolve(args.librariesFile) : null
  // Resolve to absolute now, before it reaches any spawn() call — several
  // steps (buildWithBuildLibrary, buildWithCmdLoad) run agda with cwd set
  // to the library's own directory (required for --build-library/module
  // resolution to work), and a relative --agda-bin would then resolve
  // against THAT cwd instead of the one this script was invoked from.
  // Left untouched when it's the bare "agda" default so PATH lookup at
  // spawn time still works (resolve('agda') would wrongly turn it into
  // an absolute path under the current cwd).
  const agdaBin = args.agdaBin.includes('/') ? resolve(args.agdaBin) : args.agdaBin

  await buildAgdai(lib, agdaBin, libraryFile)
  console.log('Run `npm run setup` to generate agdai-manifest.json and package .agdai files into static/.')
}

main().catch(err => { console.error(err); process.exit(1) })
