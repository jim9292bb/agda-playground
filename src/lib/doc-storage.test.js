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

  it('reports another tab\'s save of the current key, but not its own or other keys', () => {
    const target = new EventTarget()
    const win = /** @type {Window} */ (/** @type {unknown} */ (target))
    const docs = new DocStorage({ getKey: () => 'k', storage: memoryStorage() })
    docs.save('mine')
    /** @type {string[]} */
    const seen = []
    const stop = docs.watch(text => seen.push(text), win)
    const fire = (/** @type {string | null} */ key, /** @type {string | null} */ newValue) =>
      target.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }))
    fire('k', 'mine')
    fire('other', 'x')
    fire('k', null)
    fire('k', 'theirs')
    stop()
    fire('k', 'later')
    expect(seen).toEqual(['theirs'])
  })

  it('adopt drops a pending save and marks the text as saved', () => {
    const storage = memoryStorage()
    const docs = new DocStorage({ getKey: () => 'k', storage, delayMs: 100 })
    docs.schedule(() => 'stale')
    docs.adopt('theirs')
    vi.advanceTimersByTime(100)
    expect(storage.getItem('k')).toBeNull()
    expect(docs.isDirty('theirs')).toBe(false)
  })
})
