/// <reference types="vitest/globals" />

// interface.ts eagerly validates every configured profile at module-load
// time (so a config error fails fast at build/dev time, not deep in some
// unrelated feature). That makes it depend on deploy.config.json and the
// generated-*.mjs files being present and mutually consistent -- true for
// `npm run check`/`build` (which regenerate them via the `precheck` step),
// but NOT for a bare `npm run test` on a fresh clone/CI: deploy.config.json
// there gets auto-created from deploy.config.example.json's placeholder
// paths, which don't resolve, so importing the real module throws before
// any test even runs. Mock all of interface.ts's generated-data imports
// with small, self-contained fixtures instead, so this test exercises the
// real resolveProfileLibraries logic without depending on real (and
// machine-local, gitignored) generated config.
vi.mock('$app/paths', () => ({ asset: (p: string) => p }))
vi.mock('../../../deploy.config.json', () => ({
  default: {
    profiles: [
      {
        label: 'Test Profile',
        als: '2.8.0',
        libraries: [
          { agdaLibPath: '/fake/stdlib/standard-library.agda-lib', label: 'stdlib', version: '1.0', agdaiDir: 'fake-agdai-dir' },
        ],
      },
    ],
  },
}))
vi.mock('../../../scripts/generated-libraries.mjs', () => ({
  GENERATED_LIBRARY_INFO: {
    '/fake/stdlib/standard-library.agda-lib': {
      name: 'stdlib-fake',
      includeSubpath: 'src',
      libraryName: 'stdlib-fake',
      agdaLibFilename: 'standard-library.agda-lib',
    },
  },
}))
vi.mock('../../../scripts/generated-agdai-keys.mjs', () => ({
  GENERATED_AGDAI_KEYS: { 'fake-agdai-dir': 'deadbeef' },
}))
vi.mock('../../../scripts/generated-als-info.mjs', () => ({
  GENERATED_ALS_INFO: { '2.8.0': { wasmFilename: 'als.wasm', wasmBytes: 123 } },
}))

import { deployProfiles, resolveProfileLibraries, type DeployProfile } from './interface'

const realProfile = deployProfiles[0]
const realLibRef = realProfile.libraries[0]

describe('resolveProfileLibraries', () => {
  it('resolves every library reference in a configured profile', () => {
    const resolved = resolveProfileLibraries(realProfile)
    expect(resolved).toEqual([
      expect.objectContaining({
        name: 'stdlib-fake',
        libKey: 'stdlib-fake',
        sourceZipAsset: '/library/stdlib-fake.zip',
        manifestAsset: '/agdai/deadbeef/agdai-manifest.json',
      }),
    ])
  })

  it('deduplicates two identical references to the same agdaLibPath', () => {
    const profile: DeployProfile = {
      ...realProfile,
      libraries: [realLibRef, { ...realLibRef }],
    }
    const resolved = resolveProfileLibraries(profile)
    expect(resolved).toHaveLength(1)
  })

  it('throws when the same agdaLibPath is referenced with two different specs', () => {
    const profile: DeployProfile = {
      ...realProfile,
      libraries: [realLibRef, { ...realLibRef, label: `${realLibRef.label ?? ''}-conflicting` }],
    }
    expect(() => resolveProfileLibraries(profile)).toThrow(/two different specs/)
  })

  it('throws when an agdaLibPath has no matching generated-libraries.mjs entry', () => {
    const profile: DeployProfile = {
      ...realProfile,
      libraries: [{ ...realLibRef, agdaLibPath: '/nonexistent/path/to.agda-lib' }],
    }
    expect(() => resolveProfileLibraries(profile)).toThrow(/no matching entry/)
  })
})
