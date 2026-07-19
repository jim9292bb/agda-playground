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
import { getAgdaDocumentVersion } from './agda/goal-state'
import { truncateToBlock, type LiterateBlock } from './agda/literate-blocks'
import { createPerformanceTrace, formatDurationMs, formatPerformanceEntry } from './performance'
import type { DriveProxyStats, PerformanceEntry, WASMLoadingProgress } from './worker/types'
import { BrowserWasiShimRuntimeBackend } from './runtime/browser-wasi-shim'
import {
  deployProfiles, resolveProfileLibraries,
  type DriveHandle, type RuntimeBackend, type DeployProfile,
} from './runtime/interface'

export type { DriveHandle, DeployProfile }
export { deployProfiles, resolveProfileLibraries }

const LS_DOC_KEY = 'agda-web-ide-beta:doc'
const loadArgs: string[] = []

function makeLspClient(rootUri: string = '/') {
  const lspExtsWithoutHover = languageServerExtensions().filter(x => !('active' in x))

  return new LSPClient({
    timeout: 10000,
    rootUri,
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
    return this.config.sourceFileName ? `${LS_DOC_KEY}:${this.config.sourceFileName}` : LS_DOC_KEY
  }

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
    if (this.runningWASM) {
      throw new Error('WASM is already running')
    }

    const backend = this._ensureBackend()

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

    const port1 = await backend.init({
      agdaVersion: this.activeProfile.als,
      libraries: resolveProfileLibraries(this.activeProfile),
      agdaBuffers: this.config.agdaBuffers,
      driveBuffers: this.config.driveBuffers,
      callbacks: {
        onWASMLoadingProgressChange: (p) => { this.wasmLoadingProgress = p },
        onWASMLoaded: () => { this.alsWorkerStatus = 'loaded' },
        onVersionReceived: (ver) => { this.receivedALSVersion = ver },
        onNumericAgdaVersionReceived: (ver) => { this.receivedNumericAgdaVersion = ver },
        onLibraryFetchProgress: (fetched, total) => { this.wasmLibraryFetchProgress = { fetched, total } },
        onDriveCreated: () => { this.driveIsCreated = true },
        onPerformanceEntries: (entries) => { this.appendPerformanceEntries(entries) },
      },
    }).catch(() => null)

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
    router.currentFilePath = this.currentFilePath
    router.onJumpToError = this.onJumpToError

    return router
  }

  async stopALSWASM() {
    if (this.alsWorkerStatus !== 'active') {
      throw new Error('cannot stop if the status is not active')
    }
    this.alsWorkerStatus = 'deactivating'
    await this.lspClient!.request('shutdown', null)
    this.lspClient!.notification('exit', null)
    await this.runningWASM
    this.runningWASM = undefined
    this.alsWorkerStatus = 'exited'
    this.deactivate()
  }

  terminateALSWASM() {
    console.log('attempting to terminate the worker')
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
    localStorage.setItem(this.docStorageKey, doc)
    await this._syncStringToDrive(doc)
  }

  /**
   * Syncs `truncated` (a prefix of the live document, see
   * literate-blocks.js's truncateToBlock) to the VFS/ALS instead of the
   * full buffer, without disturbing the persisted "resume editing" copy
   * of the real, untruncated document.
   */
  private async _syncTruncatedStringToDrive(truncated: string) {
    localStorage.setItem(this.docStorageKey, this.editorView!.state.doc.toString())
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

  async runAgdaInteraction(interaction: string, options: { suppressAgdaInternalErrors?: boolean, suppressDisplayInfo?: boolean } = {}) {
    const encodedFilePath = JSON.stringify(this.currentFilePath)

    this.alsRouter!.lastAgdaInternalError = null
    this.alsRouter!.lastAgdaError = null
    await this.runAgdaCommand({
      tag: 'CmdReq',
      contents: `IOTCM ${encodedFilePath} NonInteractive Direct ${interaction}`,
    }, options)
    if (this.alsRouter!.lastAgdaInternalError) {
      throw new Error(`ALS failed to process ${this.currentFilePath}: ${this.alsRouter!.lastAgdaInternalError}`)
    }
    if (this.alsRouter!.lastAgdaError) {
      throw new Error(this.alsRouter!.lastAgdaError)
    }
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
      this.alsRouter!.lastAgdaInternalError = null
      this.alsRouter!.lastAgdaError = null
      await this.runAgdaCommand({
        tag: 'CmdReq',
        contents: `IOTCM ${encodedFilePath} NonInteractive Direct (Cmd_load ${encodedFilePath} ${JSON.stringify(loadArgs)})`,
      })
      if (this.alsRouter!.lastAgdaInternalError) {
        throw new Error(`ALS failed to process ${this.currentFilePath}: ${this.alsRouter!.lastAgdaInternalError}`)
      }
      if (this.alsRouter!.lastAgdaError) {
        throw new Error(this.alsRouter!.lastAgdaError)
      }
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
  async syncTruncatedSourceFileToDrive(view: EditorView, blocks: LiterateBlock[], blockIndex: number) {
    const key = `${getAgdaDocumentVersion(view.state)}:${blockIndex}`
    if (key === this._lastLoadedBlockKey) return

    const truncated = truncateToBlock(view.state.doc.toString(), blocks, blockIndex)
    await this._syncTruncatedStringToDrive(truncated)
    await this._loadAndHighlightCurrentDrive()
    this._lastLoadedBlockKey = key
  }

  async runAgdaCommand(
    params: { tag: 'CmdReq', contents: string },
    options: { suppressAgdaInternalErrors?: boolean, suppressDisplayInfo?: boolean } = {},
  ) {
    if (!this.alsRouter) {
      throw new Error('ALS router not ready')
    }

    this.alsRouter.suppressAgdaInternalErrors = options.suppressAgdaInternalErrors ?? false
    this.alsRouter.suppressDisplayInfo = options.suppressDisplayInfo ?? false
    this.alsRouter.beginCommandDocumentVersion(getAgdaDocumentVersion(this.editorView!.state))
    try {
      await this.lspClient!.request('agda', params)

      while (this.iotcmStatus !== 'ready') {
        await new Promise(r => setTimeout(r, 50))
      }
    } finally {
      this.alsRouter.suppressAgdaInternalErrors = false
      this.alsRouter.suppressDisplayInfo = false
      this.alsRouter.clearCommandDocumentVersion()
    }
  }
}
