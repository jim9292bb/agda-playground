import type { EditorView } from '@codemirror/view'
import { Compartment } from '@codemirror/state'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'

import { hoverTooltips } from '$lib/codemirror/lsp-hover'

import {
  createReadableByteStream,
  createWritableByteStream,
} from '$lib'
import { ALSMessageRouter, makeLSPTransport, type AgdaIOTCMStatus } from './agda/transport'
import { commit } from './codemirror/offsets'
import { getAgdaDocumentVersion, getAgdaGoalById, goalToLegacyRange } from './agda/goal-state'
import { giveCommand } from './agda/commands'
import { setGoalContent } from './agda/editor-mutations'
import { emitRunningInfo } from './agda/effects'
import { goalContentToAgdaRange } from './agda/ranges'
import { truncateToBlock, type LiterateBlock } from './agda/literate-blocks'
import { createPerformanceTrace, formatDurationMs, formatPerformanceEntry } from './performance'
import type { DriveProxyStats, PerformanceEntry, WASMLoadingProgress } from './worker/types'
import { BrowserWasiShimRuntimeBackend } from './runtime/browser-wasi-shim'
import DOMPurify from 'dompurify'
import { DocStorage } from './doc-storage'
import {
  deployProfiles, resolveProfileLibraries,
  type DriveHandle, type RuntimeBackend, type DeployProfile,
} from './runtime/interface'

export type { DriveHandle, DeployProfile }
export { deployProfiles, resolveProfileLibraries }

/** Why a command fails when the Agda worker stops or restarts under it. */
export const AGDA_RESTARTED_MESSAGE = 'Agda was restarted before the command finished.'

/** Why a command fails when its document is replaced wholesale under it. */
export const DOCUMENT_REPLACED_MESSAGE = 'the document was replaced before the command finished.'

type PendingGoal = { id: number, from: number, to: number, text: string }

export type AgdaCommandOptions = {
  suppressAgdaInternalErrors?: boolean,
  suppressDisplayInfo?: boolean,
  /** The goal a GiveAction response falls back to. */
  pendingGiveGoal?: PendingGoal,
  /** The goal a MakeCase response replaces. */
  pendingCaseSplitGoal?: PendingGoal,
  /** A Load: its InteractionPoints replace the tracked goals. */
  replaceGoals?: boolean,
}

/** What one command's responses reported, read before the next one runs. */
export type AgdaCommandResult = {
  /** The document was replaced while it ran: its responses were ignored. */
  discarded: boolean,
  internalError: string | null,
  error: string | null,
  solutions: { id: number, expression: string }[] | undefined,
}

function throwIfAgdaFailed(result: AgdaCommandResult, filePath: string) {
  if (result.discarded) {
    throw new Error(DOCUMENT_REPLACED_MESSAGE)
  }
  if (result.internalError) {
    throw new Error(`ALS failed to process ${filePath}: ${result.internalError}`)
  }
  if (result.error) {
    throw new Error(result.error)
  }
}

const LS_DOC_KEY = 'agda-web-ide-beta:doc'
const loadArgs: string[] = []

function makeLspClient(rootUri: string = '/') {
  const lspExtsWithoutHover = languageServerExtensions().filter(x => !('active' in x))

  return new LSPClient({
    timeout: 10000,
    rootUri,
    // Markdown from the server is rendered with `marked`, which keeps raw HTML.
    sanitizeHTML: html => DOMPurify.sanitize(html),
    extensions: [
      ...lspExtsWithoutHover,
      hoverTooltips(),
    ],
  })
}

function formatDriveProxyStats(stats: DriveProxyStats): Record<string, unknown> {
  const methods = Object.entries(stats.methods)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([method, count]) => `${method} ${count} / ${formatDurationMs(stats.methodDurationsMs[method] ?? 0)}`)
    .join(', ')

  const formatTopPaths = (paths: DriveProxyStats['pathStatPaths']) =>
    Object.entries(paths)
      .sort((a, b) => b[1].count - a[1].count || b[1].durationMs - a[1].durationMs)
      .slice(0, 4)
      .map(([path, pathStats]) => `${path} ${pathStats.count} / ${formatDurationMs(pathStats.durationMs)}`)
      .join('; ')

  const formatExtensionStats = (label: string, extensionStats: DriveProxyStats['agda']) =>
    `${label} pathStat ${extensionStats.pathStat}, open ${extensionStats.open}, read ${extensionStats.read}, write ${extensionStats.write}`

  return {
    calls: stats.totalCalls,
    totalMs: stats.totalDurationMs,
    readBytes: stats.bytesRead,
    writtenBytes: stats.bytesWritten,
    pathStatCount: stats.methods.pathStat ?? 0,
    pathStatMs: stats.methodDurationsMs.pathStat ?? 0,
    openCount: stats.methods.open ?? 0,
    openMs: stats.methodDurationsMs.open ?? 0,
    uniquePathStatPaths: stats.uniquePathStatPaths,
    pathStatSuccesses: stats.pathStatSuccesses,
    pathStatFailures: stats.pathStatFailures,
    agdaiPathStat: stats.agdai.pathStat,
    agdaiOpen: stats.agdai.open,
    agdaiRead: stats.agdai.read,
    agdaiWrite: stats.agdai.write,
    agdaPathStat: stats.agda.pathStat,
    agdaOpen: stats.agda.open,
    agdaRead: stats.agda.read,
    agdaWrite: stats.agda.write,
    methods,
    topPathStatPaths: formatTopPaths(stats.pathStatPaths),
    topOpenPaths: formatTopPaths(stats.openPaths),
    agdaStats: formatExtensionStats('.agda', stats.agda),
    agdaiStats: formatExtensionStats('.agdai', stats.agdai),
  }
}

export class AgdaController {
  private _backend: RuntimeBackend | undefined
  /** The backend whose init() startALSWASM() is awaiting, if any. */
  private _initializingBackend: RuntimeBackend | undefined
  /** `${documentVersion}:${blockIndex}` of the block-truncated prefix
   *  currently loaded into ALS, `'ALL'` after a full loadAgdaFile(), or null
   *  before any load — see syncTruncatedSourceFileToDrive(). */
  private _lastLoadedBlockKey: string | null = null

  editorView?: EditorView
  lspClient?: LSPClient
  alsRouter?: ALSMessageRouter
  runningWASM?: Promise<number>

  lspClientCompartment = new Compartment()
  driveIsLocked = false

  alsWorkerStatus = $state<'initial' | 'errored' | 'loading' | 'loaded' | 'active' | 'deactivating' | 'terminated' | 'exited'>('initial')
  wasmLoadingProgress = $state<WASMLoadingProgress | null>(null)
  wasmLibraryFetchProgress = $state<{ fetched: number; total: number } | null>(null)
  receivedALSVersion = $state<string | undefined>()
  /** Bare numeric Agda version (`agda --numeric-version`) — used by triggerPrefetch
   *  to locate the matching prebuilt .agdai cache, if any (see prefetch.js). */
  receivedNumericAgdaVersion = $state<string | undefined>()
  driveIsCreated = $state(false)
  currentFilePath = $state('/source.agda')
  /** Overrides handlers.js's default JumpToError behavior (focusing the
   *  one editorView directly) -- unset on the single-buffer `/` route;
   *  `/literate` sets this since editorView is a hidden, never-mounted
   *  view there and jumping needs to resolve which visible cell to focus
   *  first. */
  onJumpToError: ((position: number) => void) | undefined = undefined
  iotcmStatus = $state<AgdaIOTCMStatus>('init')
  /** Agda's own implicit/irrelevant-argument display options, exactly as
   *  last reported by a Status response (Agda answers every Toggle with
   *  one) -- the source of truth for the Settings checkboxes. Reset to
   *  Agda's defaults (off) whenever a new ALS process starts (see
   *  _startALSWASM), since a restarted or profile-switched Agda doesn't
   *  keep the old setting. */
  showImplicitArgs = $state(false)
  showIrrelevantArgs = $state(false)
  performanceEntries = $state<PerformanceEntry[]>([])
  queryResults = $state<Array<{ id: number; label: string; content: string }>>([])
  private _nextQueryId = 0

  /** Which deploy.config.json profile (ALS version + library set) is currently active.
   *  Switching requires a session restart — see switchProfile(). */
  selectedProfileLabel = $state<string>(deployProfiles[0]?.label ?? '')

  get activeProfile(): DeployProfile {
    return deployProfiles.find(p => p.label === this.selectedProfileLabel) ?? deployProfiles[0]
  }

  /** localStorage key this instance persists its buffer under. Namespaced by
   *  config.sourceFileName so routes using a non-default source file (e.g.
   *  the literate-programming route's source.lagda.md) don't share storage
   *  with — and silently overwrite — the default route's saved buffer.
   *  Equals the plain LS_DOC_KEY when sourceFileName is unset, matching
   *  today's behavior exactly. */
  get docStorageKey(): string {
    const base = this.config.sourceFileName ? `${LS_DOC_KEY}:${this.config.sourceFileName}` : LS_DOC_KEY
    return this.docStorageScope ? `${base}:chapter:${this.docStorageScope}` : base
  }

  /** Which saved document of this route is open: null for the route's own
   *  buffer, or a PLFA chapter id, each chapter keeping its own saved copy. */
  docStorageScope = $state<string | null>(null)

  /** The browser-saved copy of the buffer under docStorageKey. */
  readonly docStorage = new DocStorage({ getKey: () => this.docStorageKey })

  appendQueryResult(label: string, content: string) {
    this.queryResults = [{ id: this._nextQueryId++, label, content }, ...this.queryResults]
  }

  clearQueryResults() {
    this.queryResults = []
  }

  get driveHandle(): DriveHandle {
    return this._ensureBackend().getDriveHandle()
  }

  get backend(): RuntimeBackend {
    return this._ensureBackend()
  }

  private _ensureBackend(): RuntimeBackend {
    if (!this._backend) {
      this._backend = new BrowserWasiShimRuntimeBackend(
        this.config.agdaBuffers, this.config.driveBuffers, this.activeProfile.als, this.config.sourceFileName)
    }
    return this._backend
  }

  constructor(readonly config: {
    agdaBuffers: {
      stdin: SharedArrayBuffer,
      stdout: SharedArrayBuffer,
    },
    driveBuffers: {
      lock: SharedArrayBuffer
      stdin: SharedArrayBuffer,
      stdout: SharedArrayBuffer,
    },
    /** Bare VFS filename for the live source buffer (no leading slash) —
     *  defaults to 'source.agda'. Set to 'source.lagda.md' (and pair with
     *  currentFilePath = '/source.lagda.md') for the literate-programming
     *  route. */
    sourceFileName?: string,
  }) {
    this.lspClient = makeLspClient()
  }

  connectEditorView(view: EditorView) {
    this.editorView = view
  }

  appendPerformanceEntries(entries: PerformanceEntry[]) {
    if (!entries.length) return
    this.performanceEntries = [...this.performanceEntries, ...entries]
    for (const entry of entries) {
      console.info('[perf]', formatPerformanceEntry(entry), entry.detail ?? '')
    }
  }

  async measurePerformance<T>(
    label: string,
    callback: () => Promise<T>,
    detail?: Record<string, unknown>,
  ): Promise<T> {
    const trace = createPerformanceTrace()
    try {
      return await trace.measure(label, callback, detail)
    } finally {
      this.appendPerformanceEntries(trace.entries)
    }
  }

  async resetDriveProxyStats() {
    if (!this.driveIsCreated) return
    await this._ensureBackend().resetDriveProxyStats()
  }

  async appendDriveProxyStats(label: string) {
    if (!this.driveIsCreated) return
    const stats = await this._ensureBackend().getDriveProxyStats()
    this.appendPerformanceEntries([{
      label,
      durationMs: 0,
      detail: formatDriveProxyStats(stats),
    }])
  }

  async startALSWASM() {
    const backend = this._ensureBackend()

    // Single-flight while a backend is initializing: after a profile switch
    // both switchProfile() and the page's auto-start $effect (which fires on
    // alsWorkerStatus === 'initial') call this, and the wasmLoadingProgress
    // check below only trips once the WASM fetch has resolved -- so without
    // this, both ran backend.init(), spawning a second worker that leaked
    // while sharing the first one's stdin/stdout buffers. Keyed on the
    // backend rather than a flag so a switch that terminates a backend
    // mid-init (its init() may then never settle) can still start the next.
    if (this._initializingBackend === backend) return

    if (this.runningWASM) {
      throw new Error('WASM is already running')
    }

    if (backend.isInitialized()) {
      // Reusing the worker after stopALSWASM() (e.g. the Restart button,
      // restartALSWASM()) was once known to deadlock the transport under
      // an earlier runtime backend — verified no longer reproducible with
      // browser-wasi-shim-memfs (the sole backend now); see
      // browser-test-restart-worker-reuse.sh.
      console.warn('reusing worker')
      return this._startALSWASM()
    }

    if (this.wasmLoadingProgress) {
      throw new Error('wasm is already loading')
    }

    this.alsWorkerStatus = 'loading'
    this.performanceEntries = []

    // switchProfile() can replace the backend while this init() is still in
    // flight (the select is re-enabled once the WASM has downloaded, while
    // library zips are still being fetched). From then on this init()'s
    // callbacks and result belong to an abandoned session and must not touch
    // the controller's state, which now tracks the new backend.
    const isCurrent = () => this._backend === backend
    this._initializingBackend = backend
    const port1 = await backend.init({
      agdaVersion: this.activeProfile.als,
      libraries: resolveProfileLibraries(this.activeProfile),
      agdaBuffers: this.config.agdaBuffers,
      driveBuffers: this.config.driveBuffers,
      callbacks: {
        onWASMLoadingProgressChange: (p) => { if (isCurrent()) this.wasmLoadingProgress = p },
        onWASMLoaded: () => { if (isCurrent()) this.alsWorkerStatus = 'loaded' },
        onVersionReceived: (ver) => { if (isCurrent()) this.receivedALSVersion = ver },
        onNumericAgdaVersionReceived: (ver) => { if (isCurrent()) this.receivedNumericAgdaVersion = ver },
        onLibraryFetchProgress: (fetched, total) => { if (isCurrent()) this.wasmLibraryFetchProgress = { fetched, total } },
        onDriveCreated: () => { if (isCurrent()) this.driveIsCreated = true },
        onPerformanceEntries: (entries) => { if (isCurrent()) this.appendPerformanceEntries(entries) },
      },
    }).catch(() => null)
      .finally(() => {
        if (this._initializingBackend === backend) this._initializingBackend = undefined
      })

    if (!isCurrent()) {
      // The backend was terminated mid-init; terminate again in case its
      // init() got as far as spawning a worker after that.
      backend.terminate()
      return
    }

    if (port1 == null) {
      this.alsWorkerStatus = 'errored'
      return
    }

    this.alsRouter = this.makeALSTransport(port1)
    return this._startALSWASM()
  }

  async restartALSWASM() {
    await this.stopALSWASM()
    return this.startALSWASM()
  }

  /** Switches to a different deploy.config.json profile (ALS version + library set).
   *  Always restarts: a new WASM instance and VFS are needed either way. */
  async switchProfile(profileLabel: string) {
    if (profileLabel === this.selectedProfileLabel) return
    if (!deployProfiles.some(p => p.label === profileLabel)) {
      throw new Error(`unknown environment: ${profileLabel}`)
    }

    if (this.alsWorkerStatus === 'active') {
      await this.stopALSWASM()
    }
    this.terminateALSWASM()
    this._backend = undefined
    this.alsWorkerStatus = 'initial'
    this.selectedProfileLabel = profileLabel

    await new Promise(r => setTimeout(r))
    return this.startALSWASM()
  }

  async _startALSWASM() {
    this.alsWorkerStatus = 'active'
    // Every run is a fresh Agda process with its display options at their
    // defaults -- including a Restart, which reuses this worker *and* router
    // (startALSWASM's isInitialized() path), so reset both here rather than
    // where the router is created.
    this.alsRouter!.showImplicitArgs = false
    this.alsRouter!.showIrrelevantArgs = false
    this.showImplicitArgs = false
    this.showIrrelevantArgs = false

    this._ensureBackend().resetBuffers()
    this.runningWASM = this._ensureBackend().run()

    this.lspClient!.connect(this.alsRouter!.transport)
    this.editorView!.dispatch({
      effects:
        this.lspClientCompartment.reconfigure(this.lspClient!.plugin(`file://${this.currentFilePath}`)),
    })

    const ret = await this.runningWASM
    this.runningWASM = undefined
    this.deactivate()

    this.alsWorkerStatus = 'exited'
    console.log('ALS worker exited with code', ret)
    return ret
  }

  makeALSTransport(stdinWaker: MessagePort) {
    if (!this.editorView) {
      throw new Error('EditorView not ready')
    }

    const { stdinWriter, stdoutReader } = this._ensureBackend().getLSPStreams()
    const lspClientReadable = createReadableByteStream(stdoutReader, stdinWaker)
    const lspClientWritable = createWritableByteStream(stdinWriter)

    const router = makeLSPTransport(
      this.editorView,
      status => {
        this.iotcmStatus = status
      },
    )

    router.intercept(lspClientReadable, lspClientWritable)
    router.appendQueryResult = (label, content) => this.appendQueryResult(label, content)
    router.onDisplayOptionsChange = ({ showImplicitArgs, showIrrelevantArgs }) => {
      this.showImplicitArgs = showImplicitArgs
      this.showIrrelevantArgs = showIrrelevantArgs
    }
    router.currentFilePath = this.currentFilePath
    router.onJumpToError = this.onJumpToError

    return router
  }

  async stopALSWASM() {
    if (this.alsWorkerStatus !== 'active') {
      throw new Error('cannot stop if the status is not active')
    }
    this.alsWorkerStatus = 'deactivating'
    this.abandonCommands()
    await this.lspClient!.request('shutdown', null)
    this.lspClient!.notification('exit', null)
    await this.runningWASM
    this.runningWASM = undefined
    this.alsWorkerStatus = 'exited'
    this.deactivate()
  }

  terminateALSWASM() {
    console.log('attempting to terminate the worker')
    this.abandonCommands()
    this._backend?.terminate()
    this.wasmLoadingProgress = null
    this.wasmLibraryFetchProgress = null
    this.runningWASM = undefined
    this.driveIsCreated = false
    this.alsWorkerStatus = 'terminated'
    this.deactivate()
  }

  deactivate() {
    this.lspClient!.disconnect()
    this.editorView!.dispatch({
      effects: this.lspClientCompartment.reconfigure([]),
    })
  }

  async syncSourceFileToDrive() {
    const doc = this.editorView!.state.doc.toString()
    this.docStorage.save(doc)
    await this._syncStringToDrive(doc)
  }

  /**
   * Syncs `truncated` (a prefix of the live document, see
   * literate-blocks.js's truncateToBlock) to the VFS/ALS instead of the
   * full buffer, without disturbing the persisted "resume editing" copy
   * of the real, untruncated document.
   */
  private async _syncTruncatedStringToDrive(truncated: string) {
    this.docStorage.save(this.editorView!.state.doc.toString())
    await this._syncStringToDrive(truncated)
  }

  private async _syncStringToDrive(doc: string) {
    if (this.driveIsLocked) {
      throw new Error('drive lock is already acquired')
    }

    console.log('will update fs...')
    console.time('update-fs')

    this.driveIsLocked = true
    try {
      await this.measurePerformance('Sync source to virtual filesystem', () => this._ensureBackend().syncSourceFile(doc), {
        bytes: new TextEncoder().encode(doc).byteLength,
      })
    } finally {
      this.driveIsLocked = false
    }

    console.log('file is synced.')
    console.timeEnd('update-fs')

    // Position mapping (offsets.js's offsetTable) is always checkpointed
    // against the real, live editorView document -- correct even when the
    // content just synced to Agda was a truncated prefix, since a prefix
    // truncation never shifts any position within the retained prefix; see
    // syncTruncatedSourceFileToDrive's doc comment.
    this.editorView!.dispatch({effects: commit.of()})

    this.lspClient!.notification('textDocument/didSave', {
      textDocument: {
        uri: 'file://' + this.currentFilePath,
      },
    })
  }

  async runAgdaInteraction(interaction: string, options: AgdaCommandOptions = {}) {
    const encodedFilePath = JSON.stringify(this.currentFilePath)
    // The goal a Give/Case split was built for, staged on the router by
    // shortcut-actions.js just before this call: it belongs to this run, so
    // take it now rather than when the run reaches the front of the queue.
    const router = this.alsRouter
    const runOptions: AgdaCommandOptions = {
      pendingGiveGoal: router?.pendingGiveGoal,
      pendingCaseSplitGoal: router?.pendingCaseSplitGoal,
      ...options,
    }
    if (router) {
      router.pendingGiveGoal = undefined
      router.pendingCaseSplitGoal = undefined
    }
    const result = await this.runAgdaCommand({
      tag: 'CmdReq',
      contents: `IOTCM ${encodedFilePath} NonInteractive Direct ${interaction}`,
    }, runOptions)
    throwIfAgdaFailed(result, this.currentFilePath)
    if (result.solutions) await this.giveSolutions(result.solutions)
  }

  /**
   * Fills in the goals a Solve constraints run found solutions for: each
   * solution is written into its goal and given, one after the other, as
   * Emacs and agda-mode-vscode do (Agda's SolveAll response leaves the
   * editing to the client). A goal no longer in the editor is skipped; a
   * Give that fails stops the rest.
   */
  private async giveSolutions(solutions: { id: number, expression: string }[]) {
    const view = this.editorView!
    let solved = 0
    for (const { id, expression } of solutions) {
      if (!setGoalContent(view, id, expression)) continue
      const goal = getAgdaGoalById(view.state, id)
      if (!goal) continue
      const range = goalContentToAgdaRange(view.state, this.currentFilePath, goal, this.receivedNumericAgdaVersion)
      await this.runAgdaInteraction(giveCommand(goal, range, expression), { pendingGiveGoal: goalToLegacyRange(goal) })
      solved++
    }
    const message = solved === 0 ? 'No solutions found.' : `${solved} goal${solved === 1 ? '' : 's'} solved.`
    view.dispatch({ effects: emitRunningInfo.of({ message: `${message}\n`, debugLevel: 1 }) })
  }

  /**
   * Runs Cmd_load + Cmd_tokenHighlighting against whatever content was most
   * recently synced to the VFS (full document or a truncated prefix) --
   * shared by loadAgdaFile() and syncTruncatedSourceFileToDrive() so the
   * two can't drift out of sync with each other.
   */
  private async _loadAndHighlightCurrentDrive() {
    const encodedFilePath = JSON.stringify(this.currentFilePath)

    await this.resetDriveProxyStats()
    try {
      await this.measurePerformance('Agda Cmd_load', async () => {
      const result = await this.runAgdaCommand({
        tag: 'CmdReq',
        contents: `IOTCM ${encodedFilePath} NonInteractive Direct (Cmd_load ${encodedFilePath} ${JSON.stringify(loadArgs)})`,
      }, { replaceGoals: true })
      throwIfAgdaFailed(result, this.currentFilePath)
      }, { file: this.currentFilePath })
    } finally {
      await this.appendDriveProxyStats('Drive proxy after Cmd_load')
    }

    await this.resetDriveProxyStats()
    try {
      await this.measurePerformance('Agda token highlighting', async () => {
      await this.runAgdaCommand({
        tag: 'CmdReq',
        contents: `IOTCM ${encodedFilePath} NonInteractive Direct (Cmd_tokenHighlighting ${encodedFilePath} Keep)`,
      }, { suppressAgdaInternalErrors: true })
      }, { file: this.currentFilePath })
    } finally {
      await this.appendDriveProxyStats('Drive proxy after token highlighting')
    }
  }

  async loadAgdaFile() {
    await this.syncSourceFileToDrive()
    await this._loadAndHighlightCurrentDrive()
    // Any subsequent per-command truncated sync must reload, even if it
    // targets a block index whose key happens to collide with a stale one.
    this._lastLoadedBlockKey = 'ALL'
  }

  /**
   * Truncates the live document to the end of `blocks[blockIndex]` (a pure
   * prefix cut — see literate-blocks.js's truncateToBlock) and, if that
   * exact prefix isn't already the currently-loaded one, syncs it and
   * re-runs Cmd_load/tokenHighlighting so interaction points only exist for
   * blocks 1..blockIndex. Positions ALS reports for content inside that
   * prefix land at the same offsets in the live document either way (a
   * prefix truncation never shifts anything before the cut point), so
   * callers can resolve the target goal from the live EditorView exactly as
   * they would after a full load — no separate offset translation needed.
   */
  /** `force`: an explicit Load always re-checks, as Emacs's agda2-load
   *  always sends Cmd_load; the cache only spares a goal command's presync. */
  async syncTruncatedSourceFileToDrive(view: EditorView, blocks: LiterateBlock[], blockIndex: number, { force = false } = {}) {
    const key = `${getAgdaDocumentVersion(view.state)}:${blockIndex}`
    if (!force && key === this._lastLoadedBlockKey) return

    const truncated = truncateToBlock(view.state.doc.toString(), blocks, blockIndex)
    await this._syncTruncatedStringToDrive(truncated)
    await this._loadAndHighlightCurrentDrive()
    this._lastLoadedBlockKey = key
  }

  /** Commands waiting for, or holding, the one Agda session. */
  commandsInFlight = $state(0)
  private commandChain: Promise<unknown> = Promise.resolve()
  /** Bumped when the worker is stopped or replaced: runs from before fail. */
  private commandGeneration = 0
  /** Fails the running command at once (its request may never answer). */
  private cancelRunningCommand: (() => void) | undefined

  private abandonCommands() {
    this.commandGeneration++
    this.cancelRunningCommand?.()
    // A new worker has loaded nothing, whatever the last prefix was.
    this._lastLoadedBlockKey = null
  }

  /** Bumped when the document is replaced wholesale: runs issued for the
   *  old one fail instead of acting on the new one. */
  private documentEpoch = 0

  /**
   * Call before replacing the whole document (another example, chapter,
   * file, or another tab's version): the running command's remaining
   * responses are ignored and queued ones are not sent.
   */
  discardCommandsForReplacedDocument() {
    this.documentEpoch++
    if (this.alsRouter && this.commandsInFlight > 0) this.alsRouter.runDiscarded = true
  }

  /**
   * Sends one IOTCM request and waits for its ResponseEnd. Requests run one
   * at a time in the order they were made (agda-mode-vscode queues them
   * too, Connection__Scheduler): Agda's responses carry no request id, so
   * two in flight at once would share each other's results and errors.
   * The per-command router state is set up when the run starts and read
   * back before the next one can begin.
   */
  runAgdaCommand(
    params: { tag: 'CmdReq', contents: string },
    options: AgdaCommandOptions = {},
  ): Promise<AgdaCommandResult> {
    const generation = this.commandGeneration
    const epoch = this.documentEpoch
    this.commandsInFlight++
    const run = this.commandChain.then(() => this.executeAgdaCommand(params, options, generation, epoch))
    const settled = run.finally(() => { this.commandsInFlight-- })
    this.commandChain = settled.catch(() => {})
    return settled
  }

  private async executeAgdaCommand(
    params: { tag: 'CmdReq', contents: string },
    options: AgdaCommandOptions,
    generation: number,
    epoch: number,
  ): Promise<AgdaCommandResult> {
    const router = this.alsRouter
    if (!router) {
      throw new Error('ALS router not ready')
    }
    if (generation !== this.commandGeneration || this.alsWorkerStatus !== 'active') {
      throw new Error(AGDA_RESTARTED_MESSAGE)
    }
    if (epoch !== this.documentEpoch) {
      throw new Error(DOCUMENT_REPLACED_MESSAGE)
    }

    router.lastAgdaInternalError = null
    router.lastAgdaError = null
    router.pendingSolutions = undefined
    router.pendingGiveGoal = options.pendingGiveGoal
    router.pendingCaseSplitGoal = options.pendingCaseSplitGoal
    router.suppressAgdaInternalErrors = options.suppressAgdaInternalErrors ?? false
    router.suppressDisplayInfo = options.suppressDisplayInfo ?? false
    router.replaceGoals = options.replaceGoals ?? false
    router.runDiscarded = false
    const cancelled = new Promise<never>((_, reject) => {
      this.cancelRunningCommand = () => reject(new Error(AGDA_RESTARTED_MESSAGE))
    })
    cancelled.catch(() => {})
    try {
      await Promise.race([this.lspClient!.request('agda', params), cancelled])

      while (this.iotcmStatus !== 'ready') {
        if (generation !== this.commandGeneration) throw new Error(AGDA_RESTARTED_MESSAGE)
        await new Promise(r => setTimeout(r, 50))
      }
      if (generation !== this.commandGeneration) throw new Error(AGDA_RESTARTED_MESSAGE)
      return {
        discarded: router.runDiscarded,
        internalError: router.lastAgdaInternalError,
        error: router.lastAgdaError,
        solutions: router.pendingSolutions,
      }
    } finally {
      this.cancelRunningCommand = undefined
      router.suppressAgdaInternalErrors = false
      router.suppressDisplayInfo = false
      router.pendingSolutions = undefined
      router.pendingGiveGoal = undefined
      router.pendingCaseSplitGoal = undefined
      router.runDiscarded = false
      router.replaceGoals = false
    }
  }

}
