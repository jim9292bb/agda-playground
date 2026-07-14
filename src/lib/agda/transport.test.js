/// <reference types="vitest/globals" />

// @andy0130tw/vscode-jsonrpc-esm's own internal imports omit file extensions,
// which Vite's bundler tolerates but plain Node/Vitest module resolution does
// not -- mock it with the real (documented) predicate semantics rather than
// touch the shared vite.config.js resolution settings for one test file.
vi.mock('@andy0130tw/vscode-jsonrpc-esm', () => ({
  Message: {
    isRequest: (/** @type {any} */ m) => typeof m.method === 'string' && m.id !== undefined,
    isNotification: (/** @type {any} */ m) => typeof m.method === 'string' && m.id === undefined,
    isResponse: (/** @type {any} */ m) =>
      (m.result !== undefined || !!m.error) && m.id !== undefined,
  },
}))

import { ALSMessageRouter } from './transport'

/** @returns {{stream: WritableStream<Uint8Array>, chunks: Uint8Array[]}} */
function makeSink() {
  /** @type {Uint8Array[]} */
  const chunks = []
  const stream = new WritableStream({
    write(chunk) {
      chunks.push(chunk)
    },
  })
  return { stream, chunks }
}

/** @param {Uint8Array[]} chunks */
function chunksToText(chunks) {
  return chunks.map(c => new TextDecoder().decode(c)).join('')
}

function makeRouter() {
  /** @type {[string, any][]} */
  const requests = []
  /** @type {string[]} */
  const statuses = []
  const router = new ALSMessageRouter(
    /** @type {any} */ ({}),
    (tag, contents) => requests.push([tag, contents]),
    status => statuses.push(status)
  )
  return { router, requests, statuses }
}

describe('ALSMessageRouter construction', () => {
  it('starts in the init state with no subscribed handlers', () => {
    const { router } = makeRouter()
    expect(router.status).toBe('init')
    expect(router.handlers).toEqual([])
  })
})

describe('document version gating', () => {
  it('accepts any version when none is active', () => {
    const { router } = makeRouter()
    expect(router.acceptsDocumentVersion(1)).toBe(true)
    expect(router.acceptsDocumentVersion(999)).toBe(true)
  })

  it('only accepts the version that was begun', () => {
    const { router } = makeRouter()
    router.beginCommandDocumentVersion(5)
    expect(router.acceptsDocumentVersion(5)).toBe(true)
    expect(router.acceptsDocumentVersion(6)).toBe(false)
  })

  it('clearing the active version reopens acceptance to any version', () => {
    const { router } = makeRouter()
    router.beginCommandDocumentVersion(5)
    router.clearCommandDocumentVersion()
    expect(router.acceptsDocumentVersion(6)).toBe(true)
  })

  it('acceptDocumentVersion sets the active version directly', () => {
    const { router } = makeRouter()
    router.acceptDocumentVersion(7)
    expect(router.acceptsDocumentVersion(7)).toBe(true)
    expect(router.acceptsDocumentVersion(8)).toBe(false)
  })
})

describe('setStatus', () => {
  it('invokes the status callback on a real transition', () => {
    const { router, statuses } = makeRouter()
    router.setStatus('ready')
    expect(router.status).toBe('ready')
    expect(statuses).toEqual(['ready'])
  })

  it('does not invoke the callback when the status is unchanged', () => {
    const { router, statuses } = makeRouter()
    router.setStatus('ready')
    router.setStatus('ready')
    expect(statuses).toEqual(['ready'])
  })
})

describe('subscribe / unsubscribe', () => {
  it('forwardIncomingMessage calls every subscribed handler with the message', () => {
    const { router } = makeRouter()
    /** @type {string[]} */
    const seenA = []
    /** @type {string[]} */
    const seenB = []
    router.cmSubscribe(msg => seenA.push(msg))
    router.cmSubscribe(msg => seenB.push(msg))
    router.forwardIncomingMessage('hello')
    expect(seenA).toEqual(['hello'])
    expect(seenB).toEqual(['hello'])
  })

  it('unsubscribe removes the given handler', () => {
    const { router } = makeRouter()
    /** @type {string[]} */
    const seen = []
    const handler = (/** @type {string} */ msg) => seen.push(msg)
    router.cmSubscribe(handler)
    router.cmUnsubscribe(handler)
    router.forwardIncomingMessage('hello')
    expect(seen).toEqual([])
  })

  it('unsubscribing a handler subscribed twice removes both registrations', () => {
    // cmUnsubscribe removes the first occurrence by index, then filters the
    // *rest* of the list for any further occurrences too -- so subscribing
    // the same function twice and unsubscribing once clears it entirely,
    // it does not just cancel one registration.
    const { router } = makeRouter()
    /** @type {string[]} */
    const seen = []
    const handler = (/** @type {string} */ msg) => seen.push(msg)
    router.cmSubscribe(handler)
    router.cmSubscribe(handler)
    router.cmUnsubscribe(handler)
    expect(router.handlers).toEqual([])
    router.forwardIncomingMessage('hello')
    expect(seen).toEqual([])
  })

  it('unsubscribing an unregistered handler is a no-op', () => {
    const { router } = makeRouter()
    const handler = () => {}
    router.cmUnsubscribe(handler)
    expect(router.handlers).toEqual([])
  })
})

describe('cmSend', () => {
  it('throws when no rpc sink has been set', () => {
    const { router } = makeRouter()
    expect(() => router.cmSend('{"jsonrpc":"2.0","method":"foo"}')).toThrow(/RPC sink is not set/)
  })

  it('frames the message with a byte-accurate Content-Length header', async () => {
    const { router } = makeRouter()
    const { stream, chunks } = makeSink()
    router.rpcSink = stream
    const body = '{"jsonrpc":"2.0","method":"café"}'
    router.cmSend(body)
    await new Promise(r => setTimeout(r, 0))
    const bodyBytes = new TextEncoder().encode(body).byteLength
    expect(chunksToText(chunks)).toBe(`Content-Length: ${bodyBytes}\r\n\r\n${body}`)
  })

  it('transitions init -> ready on an "initialized" notification', async () => {
    const { router } = makeRouter()
    const { stream } = makeSink()
    router.rpcSink = stream
    expect(router.status).toBe('init')
    router.cmSend(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }))
    expect(router.status).toBe('ready')
  })

  it('transitions ready -> requested on an "agda" request', async () => {
    const { router } = makeRouter()
    const { stream } = makeSink()
    router.rpcSink = stream
    router.setStatus('ready')
    router.cmSend(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'agda', params: {} }))
    expect(router.status).toBe('requested')
  })

  it('does not transition status for unrelated notifications', async () => {
    const { router } = makeRouter()
    const { stream } = makeSink()
    router.rpcSink = stream
    router.cmSend(JSON.stringify({ jsonrpc: '2.0', method: 'textDocument/somethingElse' }))
    expect(router.status).toBe('init')
  })
})
