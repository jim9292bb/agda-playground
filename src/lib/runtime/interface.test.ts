/// <reference types="vitest/globals" />

import { deployProfiles, resolveProfileLibraries, type DeployProfile } from './interface'

// deployProfiles/GENERATED_LIBRARY_INFO come from real, locally-generated
// project config (scripts/generate-library-info.mjs via `npm run setup`) --
// the same precondition the whole app's build/check already depends on. We
// derive test fixtures from the real profile data rather than hardcoding an
// agdaLibPath (those are absolute, machine-local paths), so this stays
// portable across environments.
const realProfile = deployProfiles[0]
const realLibRef = realProfile.libraries[0]

describe('resolveProfileLibraries', () => {
  it('resolves every library reference in a real configured profile', () => {
    const resolved = resolveProfileLibraries(realProfile)
    expect(resolved.length).toBeGreaterThan(0)
    for (const lib of resolved) {
      expect(lib.name).toBeTruthy()
      expect(lib.libKey).toBe(lib.name)
      expect(lib.sourceZipAsset).toContain(`/library/${lib.name}.zip`)
      expect(lib.manifestAsset).toContain('/agdai/')
    }
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
