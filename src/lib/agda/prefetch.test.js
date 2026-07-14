/// <reference types="vitest/globals" />

import { triggerPrefetch } from './prefetch'

/** @param {Record<string, {graph: Record<string, string[]>} | null>} byUrl */
function mockFetch(byUrl) {
  return vi.fn(async (/** @type {string} */ url) => {
    const body = byUrl[url]
    if (body === undefined) return { ok: false, status: 404 }
    return { ok: true, json: async () => body }
  })
}

// loadLibraryManifest caches by libKey in a module-level Map for the
// process's lifetime, so every test must use its own unique libKey/
// manifestAsset -- reusing one across tests would silently serve a
// previous test's cached (or absent) manifest instead of re-fetching.
let libCounter = 0
/** @param {Partial<import('$lib/runtime/interface').ResolvedLibrary>} overrides */
function lib(overrides) {
  const key = `lib-${libCounter++}`
  return /** @type {import('$lib/runtime/interface').ResolvedLibrary} */ ({
    name: key,
    libKey: key,
    manifestAsset: `/agdai/${key}/agdai-manifest.json`,
    includeSubpath: 'src',
    ...overrides,
  })
}

describe('triggerPrefetch', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
  })

  it('parses top-level imports, resolves their transitive deps, and prefetches the .agdai paths', async () => {
    const stdlib = lib({})
    global.fetch = mockFetch({
      [stdlib.manifestAsset]: {
        graph: {
          'Data.Nat': ['Agda.Builtin.Nat'],
          'Agda.Builtin.Nat': [],
        },
      },
    })

    /** @type {string[][]} */
    const calls = []
    await triggerPrefetch(
      'module M where\nimport Data.Nat\n',
      paths => calls.push(paths),
      [stdlib],
      '2.8.0'
    )

    expect(calls).toHaveLength(1)
    const paths = calls[0].sort()
    expect(paths).toEqual([
      `${stdlib.name}/_build/2.8.0/agda/src/Agda/Builtin/Nat.agdai`,
      `${stdlib.name}/_build/2.8.0/agda/src/Data/Nat.agdai`,
    ])
  })

  it('does not call prefetchFn when there are no resolvable deps', async () => {
    global.fetch = mockFetch({})
    /** @type {string[][]} */
    const calls = []
    await triggerPrefetch('module M where\n', paths => calls.push(paths), [], '2.8.0')
    expect(calls).toEqual([])
  })

  it('degrades gracefully when a manifest fetch fails (404)', async () => {
    const stdlib = lib({})
    global.fetch = mockFetch({}) // no entry -> 404
    /** @type {string[][]} */
    const calls = []
    await triggerPrefetch('import Data.Nat\n', paths => calls.push(paths), [stdlib], '2.8.0')
    expect(calls).toEqual([])
  })

  it('degrades gracefully when fetch itself throws', async () => {
    const stdlib = lib({})
    global.fetch = vi.fn(async () => { throw new Error('network down') })
    /** @type {string[][]} */
    const calls = []
    await triggerPrefetch('import Data.Nat\n', paths => calls.push(paths), [stdlib], '2.8.0')
    expect(calls).toEqual([])
  })

  it('excludes the synthetic "Everything" module some libraries import', async () => {
    const stdlib = lib({})
    global.fetch = mockFetch({
      [stdlib.manifestAsset]: { graph: { Everything: ['Data.Nat'], 'Data.Nat': [] } },
    })
    /** @type {string[][]} */
    const calls = []
    await triggerPrefetch('import Everything\n', paths => calls.push(paths), [stdlib], '2.8.0')
    // "Everything" itself is excluded, but modules it (transitively) depends on are still prefetched
    expect(calls[0]).toEqual([`${stdlib.name}/_build/2.8.0/agda/src/Data/Nat.agdai`])
  })

  it('merges manifests across multiple active libraries for cross-library deps', async () => {
    const stdlib = lib({})
    const categories = lib({})
    global.fetch = mockFetch({
      [stdlib.manifestAsset]: { graph: { 'Data.Nat': [] } },
      [categories.manifestAsset]: { graph: { 'Categories.Category': ['Data.Nat'] } },
    })
    /** @type {string[][]} */
    const calls = []
    await triggerPrefetch('import Categories.Category\n', paths => calls.push(paths), [stdlib, categories], '2.8.0')
    const paths = calls[0].sort()
    const expected = [
      `${categories.name}/_build/2.8.0/agda/src/Categories/Category.agdai`,
      `${stdlib.name}/_build/2.8.0/agda/src/Data/Nat.agdai`,
    ].sort()
    expect(paths).toEqual(expected)
  })

  it('recognizes both "import" and "open import" forms', async () => {
    const stdlib = lib({})
    global.fetch = mockFetch({
      [stdlib.manifestAsset]: { graph: { 'Data.Nat': [], 'Data.Bool': [] } },
    })
    /** @type {string[][]} */
    const calls = []
    await triggerPrefetch(
      'open import Data.Nat\nimport Data.Bool\n',
      paths => calls.push(paths),
      [stdlib],
      '2.8.0'
    )
    expect(calls[0].sort()).toEqual([
      `${stdlib.name}/_build/2.8.0/agda/src/Data/Bool.agdai`,
      `${stdlib.name}/_build/2.8.0/agda/src/Data/Nat.agdai`,
    ])
  })
})
