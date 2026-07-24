/**
 * Single source of truth for where the PLFA Notebook's prebuilt `.agdai`
 * cache comes from.
 *
 * The `plfa-agdai-v1` release of this repository hosts a STORED-only ZIP
 * per library (packaged with zip-utils.mjs's zipDirectory(), extracted with
 * its extractZip() -- no external tar/unzip dependency, matching
 * als-release.mjs's own download pattern):
 *   - standard-library-2.1.1-agdai.zip -> .deploy-assets/auto/agdai/standard-library-2.1.1
 *   - plfa-agdai.zip                   -> .deploy-assets/auto/agdai/plfa
 *
 * This cache exists because a fresh build container (e.g. Vercel) can't
 * reproduce it from scratch: doing so requires compiling a version-exact
 * native Agda 2.7.0.1 binary from source via cabal, which is impractical as
 * a build step. It was built once locally and uploaded here instead -- see
 * the release notes at the URL below for full provenance (exact Agda/
 * stdlib/plfa versions and the build-agdai.mjs commands used).
 *
 * This cache is version-exact: Agda silently ignores a `.agdai` cache built
 * by a different Agda/library version rather than erroring, so if
 * deploy.config.json's PLFA profile ever moves to different versions, this
 * cache stops applying (PLFA Notebook still works, just slower on first
 * Load) until a new release is cut here.
 *
 * To update: rebuild the cache locally per CLAUDE.md's `/plfa` route
 * section, then `gh release upload plfa-agdai-v1 <new zips> --clobber`
 * (or cut a new tag and update PLFA_AGDAI_RELEASE below).
 */

import { withRetry } from './fetch-retry.mjs'

const PLFA_AGDAI_RELEASE =
  'https://github.com/jim9292bb/agda-playground/releases/download/plfa-agdai-v1'

export const PLFA_AGDAI_ASSETS = [
  { zip: 'standard-library-2.1.1-agdai.zip', agdaiDirName: 'standard-library-2.1.1' },
  { zip: 'plfa-agdai.zip', agdaiDirName: 'plfa' },
]

export const plfaAgdaiZipUrl = (zipName) => `${PLFA_AGDAI_RELEASE}/${zipName}`

export async function download(url) {
  return withRetry(async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`)
    return Buffer.from(await res.arrayBuffer())
  }, { label: url })
}
