/// <reference types="vitest/globals" />

import { DocStorage } from './doc-storage'

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map()
  return /** @type {Storage} */ (/** @type {unknown} */ ({
    getItem: (/** @type {string} */ k) => map.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { map.set(k, v) },
    map,
  }))
}

describe('DocStorage', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('loads the saved text, or the fallback when nothing is saved', () => {
    const storage = memoryStorage()
    const docs = new DocStorage({ getKey: () => 'k', storage })
    expect(docs.load('default')).toBe('default')
    storage.setItem('k', 'saved')
    expect(docs.load('default')).toBe('saved')
    expect(docs.isDirty('saved')).toBe(false)
  })

  it('saves a scheduled edit after the delay, keeping only the latest', () => {
    const storage = memoryStorage()
    const docs = new DocStorage({ getKey: () => 'k', storage, delayMs: 100 })
    let text = 'a'
    docs.schedule(() => text)
    text = 'ab'
    docs.schedule(() => text)
    expect(storage.getItem('k')).toBeNull()
    vi.advanceTimersByTime(100)
    expect(storage.getItem('k')).toBe('ab')
    expect(docs.isDirty('ab')).toBe(false)
  })

  it('flush saves a pending edit at once (page hidden)', () => {
    const storage = memoryStorage()
    const docs = new DocStorage({ getKey: () => 'k', storage, delayMs: 1000 })
    docs.schedule(() => 'typed')
    docs.flush()
    expect(storage.getItem('k')).toBe('typed')
    docs.flush()
    vi.advanceTimersByTime(1000)
    expect(storage.getItem('k')).toBe('typed')
  })

  it('save cancels a pending scheduled save', () => {
    const storage = memoryStorage()
    const docs = new DocStorage({ getKey: () => 'k', storage, delayMs: 100 })
    docs.schedule(() => 'old')
    docs.save('new')
    vi.advanceTimersByTime(100)
    expect(storage.getItem('k')).toBe('new')
  })

  it('keeps working when storage throws', () => {
    const storage = /** @type {Storage} */ (/** @type {unknown} */ ({
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('full') },
    }))
    const docs = new DocStorage({ getKey: () => 'k', storage })
    expect(docs.load('default')).toBe('default')
    expect(() => docs.save('x')).not.toThrow()
  })
})
