/// <reference types="vitest/globals" />

import { traceFetchProgress } from './index.js'

/** Body that yields two chunks, pausing before the second until `release()` is called. */
function makeControlledBody() {
  /** @type {() => void} */
  let release = () => {}
  const gate = new Promise(r => { release = r })
  let pulled = 0
  const stream = new ReadableStream({
    async pull(controller) {
      if (pulled === 0) {
        pulled++
        controller.enqueue(new Uint8Array([1, 2, 3]))
      } else if (pulled === 1) {
        pulled++
        await gate
        controller.enqueue(new Uint8Array([4, 5, 6]))
        controller.close()
      }
    },
  })
  return { stream, release }
}

describe('traceFetchProgress', () => {
  it('throws when the response has no body', () => {
    const resp = new Response(null)
    expect(() => traceFetchProgress(resp, () => {})).toThrow(/no body/)
  })

  it('throws when the response body has already been consumed', async () => {
    const resp = new Response('hello')
    await resp.text()
    expect(() => traceFetchProgress(resp, () => {})).toThrow(/has been consumed/)
  })

  it('reports bytesTotal from Content-Length when the encoding is identity', () => {
    const resp = new Response('hello', { headers: { 'content-length': '5' } })
    const { bytesTotal } = traceFetchProgress(resp, () => {})
    expect(bytesTotal).toBe(5)
  })

  it('reports bytesTotal as -1 when the response is content-encoded (decompressed size differs)', () => {
    const resp = new Response('hello', { headers: { 'content-length': '5', 'content-encoding': 'gzip' } })
    const { bytesTotal } = traceFetchProgress(resp, () => {})
    expect(bytesTotal).toBe(-1)
  })

  it('reports bytesTotal as -1 when there is no Content-Length header', () => {
    const resp = new Response('hello')
    const { bytesTotal } = traceFetchProgress(resp, () => {})
    expect(bytesTotal).toBe(-1)
  })

  it('reports cumulative progress and reproduces the body bytes as they are read', async () => {
    const { stream, release } = makeControlledBody()
    const resp = new Response(stream)
    /** @type {number[]} */
    const progress = []
    const { source, finished } = traceFetchProgress(resp, n => progress.push(n))

    const reader = source.stream.getReader()
    const first = await reader.read()
    expect(first.value).toEqual(new Uint8Array([1, 2, 3]))
    expect(progress).toEqual([3])

    release()
    const second = await reader.read()
    expect(second.value).toEqual(new Uint8Array([4, 5, 6]))
    expect(progress).toEqual([3, 6])

    const third = await reader.read()
    expect(third.done).toBe(true)
    await finished
  })

  it('errors the output stream once cancel() is called', async () => {
    const { stream, release } = makeControlledBody()
    const resp = new Response(stream)
    const { source, cancel } = traceFetchProgress(resp, () => {})

    const reader = source.stream.getReader()
    await reader.read() // first chunk

    cancel()
    release() // let the paused second read proceed, past the now-true cancelled check

    await expect(reader.read()).rejects.toThrow('cancelled')
  })
})
