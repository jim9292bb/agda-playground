/**
 * Generates `.deploy-assets/.cache/<id>/agdai-manifest.json` — the
 * dependency graph `src/lib/agda/prefetch.js` uses to prefetch `.agdai`
 * files — directly from each library's own source tree at the OS path
 * recorded in `deploy.local.json`, no hand-written `Everything.agda` and
 * no native `--dependency-graph` run required.
 *
 * For each of the library's own source files, this spawns
 * `agda --interaction-json` and sends `Cmd_tokenHighlighting` — an Agda
 * interaction command that returns purely lexical token highlighting for
 * a single file without loading, resolving, or type-checking any of its
 * imports (confirmed: it works standalone even when the imports don't
 * exist). Every highlighted range that is *not* a `keyword` (comments —
 * including nested ones — literate prose/code-fence markup, symbols,
 * holes, pragma bodies, string/number literals) is replaced with a
 * single space; matching `\bimport\b\s*(\S+)\s` against the result then
 * correctly extracts the file's own direct import targets, immune to
 * every edge case found while developing this (multi-line `import`,
 * comments glued with zero surrounding whitespace, semicolon-glued
 * declarations, literate prose that happens to contain text shaped like
 * an import statement).
 *
 * This is strictly more complete than the `agda --dependency-graph`-based
 * approach it replaces: that tool's Dot backend applies a transitive
 * reduction (for graph-visualization purposes), silently dropping real
 * direct edges whenever the same target is also reachable some other
 * way. `prefetch.js`'s `collectDeps` does a plain transitive-closure
 * walk, so the extra (previously-dropped) edges this script keeps don't
 * change prefetch behavior — closure is invariant under transitive
 * reduction — they just make the manifest's own per-module edge list
 * accurate.
 *
 * Usage:
 *   node scripts/generate-manifest.mjs [--lib-file <path>]
 *
 * Without --lib-file, processes all libraries in deploy.config.json that
 * have agdaiDir configured. With --lib-file <path>, processes only that one
 * (regardless of whether agdaiDir is set — useful for one-off regeneration).
 */

import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { randomBytes } from 'node:crypto'
import { getLocalLibraries, REPO_ROOT } from './resolve-deploy-config.mjs'
import { GRAPH_ALS_VERSION } from './als-release.mjs'
import { parseAgdaLibInclude } from './agda-lib-utils.mjs'

const DEPLOY_ASSETS = dirname(fileURLToPath(import.meta.url))

// Every extension agda's own lexer recognizes (`.agda` plus every literate
// variant) — confirmed empirically that `import` resolution searches all of
// these, not just `.agda`/`.lagda` (the two an unrelated error message
// happens to list as examples).
export const AGDA_FILE_EXTENSIONS = [
  '.agda', '.lagda', '.lagda.tex', '.lagda.rst',
  '.lagda.md', '.lagda.org', '.lagda.tree', '.lagda.typ',
]

function parseArgs(argv) {
  const args = { libFile: null, agdaBin: null, wasm: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lib-file') args.libFile = argv[++i]
    else if (argv[i] === '--agda-bin') args.agdaBin = argv[++i]
    else if (argv[i] === '--wasm') args.wasm = argv[++i]
    else throw new Error(`unknown argument: ${argv[i]}`)
  }
  return args
}

function matchAgdaExtension(filename) {
  return AGDA_FILE_EXTENSIONS.find(ext => filename.endsWith(ext))
}

function pathToModuleName(filePath, includeDir, ext) {
  return relative(includeDir, filePath)
    .slice(0, -ext.length)
    .split(sep)
    .join('.')
}

async function findAgdaFiles(dir, result = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) await findAgdaFiles(p, result)
    else if (matchAgdaExtension(entry.name)) result.push(p)
  }
  return result
}

function isExcluded(mod) {
  return mod.startsWith('Agda.')
}

/** Run `tasks` (each a () => Promise) with at most `limit` in flight at once. */
async function runPool(tasks, limit) {
  const results = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

// ── WASM pool for Cmd_tokenHighlighting ──────────────────────────────────────

async function makeWasmWorkerScript() {
  const path = join(DEPLOY_ASSETS, '.wasm-worker-' + randomBytes(4).toString('hex') + '.mjs')
  await writeFile(path, `
import { readFile } from 'node:fs/promises'
import { WASI } from 'node:wasi'
const [,,srcDir, agdaDataDir, wasmPath] = process.argv
const wasi = new WASI({
  version: 'preview1', args: ['als', '--raw'],
  env: { HOME: '/home/root', Agda_datadir: '/agda-data' },
  preopens: { '/src': srcDir, '/agda-data': agdaDataDir },
})
const buf = await readFile(wasmPath)
const mod = await WebAssembly.compile(buf)
const inst = await WebAssembly.instantiate(mod, wasi.getImportObject())
try { wasi.start(inst) } catch(e) { if (!String(e).includes('exit')) throw e }
`)
  return path
}

function createHighlightingClient(workerScript, srcDir, agdaDataDir, wasmPath) {
  const child = spawn(process.execPath, [workerScript, srcDir, agdaDataDir, wasmPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stderr.on('data', d => {
    const s = d.toString()
    if (!s.includes('ExperimentalWarning') && !s.includes('[Info]') && !s.includes('[Debug]') && !s.includes('[Warning]'))
      process.stderr.write(s)
  })

  let nextId = 1
  const send = obj => {
    const body = JSON.stringify({ jsonrpc: '2.0', ...obj })
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  let inBuf = ''
  let initResolve = null
  let pendingPayload = null
  let pendingEndResolve = null
  const initId = nextId++
  const initDone = new Promise(r => { initResolve = r })

  child.stdout.on('data', d => {
    inBuf += d.toString()
    for (;;) {
      const m = inBuf.match(/Content-Length: (\d+)\r\n\r\n/)
      if (!m) break
      const len = parseInt(m[1])
      const start = m.index + m[0].length
      if (inBuf.length < start + len) break
      const body = inBuf.slice(start, start + len)
      inBuf = inBuf.slice(start + len)
      try {
        const msg = JSON.parse(body)
        if (msg.id === initId && msg.result != null && initResolve) {
          initResolve(); initResolve = null
        }
        if (msg.method === 'agda' && msg.id != null) {
          const { tag, contents } = msg.params ?? {}
          if (tag === 'ResponseJSONRaw' &&
              contents?.kind === 'HighlightingInfo' &&
              contents?.info?.payload) {
            pendingPayload = contents.info.payload
          }
          send({ id: msg.id, result: null })
          if (tag === 'ResponseEnd' && pendingEndResolve) {
            const resolve = pendingEndResolve
            const payload = pendingPayload ?? []
            pendingPayload = null
            pendingEndResolve = null
            resolve(payload)
          }
        }
      } catch (err) {
        // The Content-Length framing above already guarantees `body` is a
        // complete message by this point, so a failure here means a real
        // malformed/unexpected message rather than a partial read — worth
        // surfacing instead of silently dropping.
        console.error('Failed to handle ALS message:', err)
      }
    }
  })

  send({ id: initId, method: 'initialize', params: { processId: null, rootUri: null, capabilities: {} } })

  const ready = initDone.then(() => {
    send({ method: 'initialized', params: {} })
  })

  const highlight = vfsPath => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${vfsPath}`)), 60_000)
    pendingEndResolve = value => { clearTimeout(timer); resolve(value) }
    send({ id: nextId++, method: 'agda', params: {
      tag: 'CmdReq',
      contents: `IOTCM ${JSON.stringify(vfsPath)} NonInteractive Direct (Cmd_tokenHighlighting ${JSON.stringify(vfsPath)} Keep)`,
    }})
  })

  return { ready, highlight, kill: () => child.kill() }
}

async function createWasmPool(alsName, srcDir) {
  const alsDir = join(REPO_ROOT, '.deploy-assets', '.als', alsName)
  let info
  try {
    info = JSON.parse(readFileSync(join(alsDir, 'als-info.json'), 'utf8'))
  } catch {
    throw new Error(`ALS "${alsName}" not found under .deploy-assets/.als/ — run \`npm install\` (its postinstall step installs the graph tool), or check your network and re-run \`node scripts/ensure-graph-als.mjs\``)
  }
  const wasmPath = join(alsDir, info.wasmFilename)
  const agdaDataDir = join(alsDir, 'agda-data')
  const workerScript = await makeWasmWorkerScript()
  const size = cpus().length
  const clients = Array.from({ length: size }, () =>
    createHighlightingClient(workerScript, srcDir, agdaDataDir, wasmPath)
  )
  await Promise.all(clients.map(c => c.ready))
  return {
    clients,
    destroy: async () => {
      clients.forEach(c => c.kill())
      await rm(workerScript, { force: true })
    },
  }
}

// ── WASM highlighting helpers ─────────────────────────────────────────────────

async function extractImportsWasm(absPath, vfsPath, client) {
  const src = await readFile(absPath, 'utf8')
  const chars = [...src]
  const payload = await client.highlight(vfsPath)
  for (const { atoms, range } of payload) {
    if (atoms.includes('keyword')) continue
    const [start, end] = range
    for (let i = start - 1; i < end - 1; i++) chars[i] = ' '
  }
  const cleaned = chars.join('')
  const found = new Set()
  for (const m of cleaned.matchAll(IMPORT_RE)) found.add(m[1])
  return [...found]
}

export async function buildGraphWasm(lib, alsName) {
  const agdaLibSrc = await readFile(lib.agdaLibPath, 'utf8')
  const include = parseAgdaLibInclude(agdaLibSrc)
  const libRoot = dirname(lib.agdaLibPath)
  const includeDir = include ? join(libRoot, include) : libRoot

  const agdaFiles = (await findAgdaFiles(includeDir)).sort()
  const poolSize = cpus().length
  console.log(`[${lib.name}] extracting imports from ${agdaFiles.length} files (ALS WASM ${alsName}, ${poolSize}-way parallel)...`)

  const pool = await createWasmPool(alsName, includeDir)
  const graph = {}
  try {
    let next = 0
    await Promise.all(pool.clients.map(async client => {
      while (next < agdaFiles.length) {
        const i = next++
        const absPath = agdaFiles[i]
        const ext = matchAgdaExtension(absPath)
        const mod = pathToModuleName(absPath, includeDir, ext)
        const vfsPath = '/src/' + relative(includeDir, absPath).split(sep).join('/')
        const imports = await extractImportsWasm(absPath, vfsPath, client)
        graph[mod] = imports.filter(d => !isExcluded(d))
      }
    }))
  } finally {
    await pool.destroy()
  }
  return graph
}

export async function processLibraryWasm(lib, alsName) {
  const graph = await buildGraphWasm(lib, alsName)
  await mkdir(lib.agdaiDir, { recursive: true })
  const json = JSON.stringify({ graph })
  const manifestPath = join(lib.agdaiDir, 'agdai-manifest.json')
  await writeFile(manifestPath, json)
  console.log(`[${lib.name}] wrote ${Object.keys(graph).length} modules, ${(json.length / 1024).toFixed(0)} KB to ${relative(REPO_ROOT, manifestPath)}`)
}

// ── Native agda highlighting ──────────────────────────────────────────────────

/** @returns {Promise<{ atoms: string[], range: [number, number] }[]>} */
function getHighlightingPayload(absPath, agdaBin) {
  return new Promise((resolve, reject) => {
    const proc = spawn(agdaBin, ['--interaction-json'])
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`agda --interaction-json exited ${code} for ${absPath}: ${stderr || stdout}`))
        return
      }
      // Agda < 2.8 emits two HighlightingInfo messages: first an indirect one
      // (direct:false, no payload) then a direct one with the payload inline.
      // Agda 2.8+ emits only the direct one.  Always pick the direct form.
      const line = stdout.split('\n').find(l => l.includes('"kind":"HighlightingInfo"') && l.includes('"direct":true'))
      if (!line) {
        reject(new Error(`no HighlightingInfo response for ${absPath}: ${stdout || stderr}`))
        return
      }
      try {
        resolve(JSON.parse(line.slice(line.indexOf('{'))).info.payload)
      } catch (err) {
        reject(new Error(`malformed HighlightingInfo response for ${absPath}: ${err.message}`))
      }
    })
    const cmd = `IOTCM "${absPath}" NonInteractive Direct (Cmd_tokenHighlighting "${absPath}" Keep)\n`
    proc.stdin.write(cmd)
    proc.stdin.end()
  })
}

const IMPORT_RE = /\bimport\b\s*(\S+)\s/g

async function extractImports(absPath, agdaBin) {
  const src = await readFile(absPath, 'utf8')
  const chars = [...src]
  const payload = await getHighlightingPayload(absPath, agdaBin)
  for (const { atoms, range } of payload) {
    if (atoms.includes('keyword')) continue
    const [start, end] = range
    for (let i = start - 1; i < end - 1; i++) chars[i] = ' '
  }
  const cleaned = chars.join('')
  const found = new Set()
  for (const m of cleaned.matchAll(IMPORT_RE)) found.add(m[1])
  return [...found]
}

/** Extracts the dependency graph from a library's source tree. Does not write to disk. */
export async function buildGraph(lib, agdaBin = 'agda') {
  const agdaLibSrc = await readFile(lib.agdaLibPath, 'utf8')
  const include = parseAgdaLibInclude(agdaLibSrc)
  const libRoot = dirname(lib.agdaLibPath)
  const includeDir = include ? join(libRoot, include) : libRoot

  const agdaFiles = (await findAgdaFiles(includeDir)).sort()
  console.log(`[${lib.name}] extracting imports from ${agdaFiles.length} files (${agdaBin} --interaction-json, ${cpus().length}-way parallel)...`)

  const graph = {}
  await runPool(
    agdaFiles.map(file => async () => {
      const ext = matchAgdaExtension(file)
      const mod = pathToModuleName(file, includeDir, ext)
      const imports = await extractImports(file, agdaBin)
      graph[mod] = imports.filter(d => !isExcluded(d))
    }),
    cpus().length,
  )
  return graph
}

/** Builds the dependency graph and writes it to agdaiDir/agdai-manifest.json. */
export async function processLibrary(lib, agdaBin = 'agda') {
  const graph = await buildGraph(lib, agdaBin)
  await mkdir(lib.agdaiDir, { recursive: true })
  const json = JSON.stringify({ graph })
  const manifestPath = join(lib.agdaiDir, 'agdai-manifest.json')
  await writeFile(manifestPath, json)
  console.log(`[${lib.name}] wrote ${Object.keys(graph).length} modules, ${(json.length / 1024).toFixed(0)} KB to ${relative(REPO_ROOT, manifestPath)}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let libs = getLocalLibraries()

  if (args.libFile) {
    const target = libs.find(l => l.agdaLibPath === args.libFile)
    if (!target) {
      const paths = libs.map(l => l.agdaLibPath).join(', ') || '(none configured)'
      throw new Error(`"${args.libFile}" not found in deploy.config.json. Available: ${paths}`)
    }
    libs = [target]
  } else {
    libs = libs.filter(l => l.agdaiDir)
    if (libs.length === 0) {
      console.log('No libraries have agdaiDir configured in deploy.config.json — nothing to do.')
      console.log('Set agdaiDir for the libraries you want to generate manifests for,')
      console.log('or use --lib-file <path/to/lib.agda-lib> to generate for a specific library regardless.')
      return
    }
  }

  let wasm = args.wasm
  let agdaBin = args.agdaBin
  if (!wasm && !agdaBin) {
    // Graph extraction (Cmd_tokenHighlighting) is purely lexical, so it
    // always uses the pinned graph-tool ALS regardless of each profile's
    // runtime ALS version. Installed by npm install (ensure-graph-als.mjs).
    wasm = GRAPH_ALS_VERSION
    console.log(`Using the ALS ${wasm} graph tool.`)
  }

  for (const lib of libs) {
    if (wasm) {
      await processLibraryWasm(lib, wasm)
    } else {
      await processLibrary(lib, agdaBin)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch(err => { console.error(err); process.exit(1) })
