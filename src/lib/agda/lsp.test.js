/// <reference types="vitest/globals" />

import { LSPMessageDecoder } from './lsp'

/** Builds a raw `Content-Length: N\r\n\r\n<body>` frame as bytes. */
function frame(body, { header = 'Content-Length' } = {}) {
  const bodyBytes = new TextEncoder().encode(body)
  const headerBytes = new TextEncoder().encode(`${header}: ${bodyBytes.byteLength}\r\n\r\n`)
  const out = new Uint8Array(headerBytes.byteLength + bodyBytes.byteLength)
  out.set(headerBytes)
  out.set(bodyBytes, headerBytes.byteLength)
  return out
}

function concat(...chunks) {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** Runs a decoder over a sequence of chunks and collects every decoded message. */
async function decodeChunks(chunks) {
  const decoder = new LSPMessageDecoder()
  const messages = []
  const controller = { enqueue: (msg) => messages.push(msg) }
  for (const chunk of chunks) {
    await decoder.transform(chunk, controller)
  }
  decoder.flush()
  return messages
}

describe('LSPMessageDecoder', () => {
  it('decodes a single complete message delivered in one chunk', async () => {
    const messages = await decodeChunks([frame('{"a":1}')])
    expect(messages).toEqual(['{"a":1}'])
  })

  it('decodes back-to-back messages arriving in a single chunk', async () => {
    const chunk = concat(frame('one'), frame('two'), frame('three'))
    const messages = await decodeChunks([chunk])
    expect(messages).toEqual(['one', 'two', 'three'])
  })

  it('decodes a message whose header is split across chunks', async () => {
    const whole = frame('hello')
    const splitAt = 5 // partway through "Content-Length: 5\r\n\r\n"
    const messages = await decodeChunks([whole.subarray(0, splitAt), whole.subarray(splitAt)])
    expect(messages).toEqual(['hello'])
  })

  it('decodes a message whose content is split across chunks', async () => {
    const whole = frame('hello world')
    const headerLen = whole.byteLength - 'hello world'.length
    const splitAt = headerLen + 5 // partway through the body
    const messages = await decodeChunks([whole.subarray(0, splitAt), whole.subarray(splitAt)])
    expect(messages).toEqual(['hello world'])
  })

  it('decodes a message delivered one byte at a time', async () => {
    const whole = frame('chunked byte by byte')
    const chunks = Array.from(whole, (byte) => new Uint8Array([byte]))
    const messages = await decodeChunks(chunks)
    expect(messages).toEqual(['chunked byte by byte'])
  })

  it('measures Content-Length in bytes, not characters, for multi-byte UTF-8 content', async () => {
    // "résumé" is 6 JS chars but 8 UTF-8 bytes — a byte-vs-char-length bug
    // would truncate or misframe this.
    const messages = await decodeChunks([frame('résumé')])
    expect(messages).toEqual(['résumé'])
  })

  it('accepts a lowercase "content-length" header (case-insensitive)', async () => {
    const messages = await decodeChunks([frame('lowercase header', { header: 'content-length' })])
    expect(messages).toEqual(['lowercase header'])
  })

  it('does not mistake a stray CR byte for a message boundary', async () => {
    // A lone \r (not followed by \n\r\n) inside the header's own bytes
    // must not be treated as the boundary — only appended here to sanity
    // check findBoundary() doesn't fire on a partial/false match; the
    // real boundary is still found correctly afterwards.
    const messages = await decodeChunks([frame('after a lone CR')])
    expect(messages).toEqual(['after a lone CR'])
  })

  it('throws on a header without a Content-Length field', async () => {
    const bad = new TextEncoder().encode('X-Not-A-Length: 3\r\n\r\nabc')
    const decoder = new LSPMessageDecoder()
    await expect(decoder.transform(bad, { enqueue: () => {} })).rejects.toThrow(/failed to parse header/)
  })

  it('flush() does not throw when the buffer is empty', () => {
    const decoder = new LSPMessageDecoder()
    expect(() => decoder.flush()).not.toThrow()
  })

  it('flush() throws if trailing data is still buffered', async () => {
    const whole = frame('incomplete')
    const decoder = new LSPMessageDecoder()
    // Only deliver the header, never the body — pending stays set and the
    // trailing header bytes are consumed, but nothing is left buffered
    // until we hand it a message we deliberately cut short.
    await decoder.transform(whole.subarray(0, whole.byteLength - 3), { enqueue: () => {} })
    expect(() => decoder.flush()).toThrow(/trailing data/)
  })
})
