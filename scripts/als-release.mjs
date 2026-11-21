/**
 * Single source of truth for where ALS runtime assets come from.
 *
 * The `als-runtime-v11` release of this repository hosts, per Agda version,
 * exactly the two files the app serves:
 *   - als-<version>.wasm      — the ALS WASM build: upstream
 *                               agda/agda-language-server v11's
 *                               als-v11-Agda-<version>-wasm.wasm, run through
 *                               `wasm-opt -Oz` (upstream ships it unoptimized,
 *                               ~3x larger); both sha256s in release notes
 *   - agda-data-<version>.zip — Agda builtin sources plus their compiled
 *                               .agdai interfaces, in the exact layout served
 *                               as static/als/<version>/agda-data.zip
 *
 * To upgrade ALS: publish new assets under a new release tag and update
 * ALS_RELEASE here (leaving older tags in place, so deployments pinned to
 * them keep working), then set the new version numbers in
 * deploy.config.json. The previous `als-runtime` release (agda-web fork
 * nightly-20260407, ALS v6, Agda 2.6.4.3-2.8.0) is kept for that reason.
 */

import { withRetry } from './fetch-retry.mjs'

const ALS_RELEASE =
  'https://github.com/jim9292bb/agda-playground/releases/download/als-runtime-v11'

/** The ALS version used by local tooling (dependency-graph extraction via
 *  Cmd_tokenHighlighting). Graph extraction is purely lexical, so one recent
 *  version works for every library regardless of the profile's ALS version. */
export const GRAPH_ALS_VERSION = '2.8.0'

export const alsWasmFilename = (version) => `als-${version}.wasm`
export const alsWasmUrl = (version) => `${ALS_RELEASE}/${alsWasmFilename(version)}`
export const agdaDataZipUrl = (version) => `${ALS_RELEASE}/agda-data-${version}.zip`

export async function download(url) {
  return withRetry(async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`)
    return Buffer.from(await res.arrayBuffer())
  }, { label: url })
}
