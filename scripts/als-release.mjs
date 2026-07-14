/**
 * Single source of truth for where ALS runtime assets come from.
 *
 * The `als-runtime` release of this repository hosts, per Agda version,
 * exactly the two files the app serves:
 *   - als-<version>.wasm      — the ALS WASM build (byte-identical copy of
 *                               upstream agda-web/agda-language-server
 *                               nightly-20260407; sha256 in release notes)
 *   - agda-data-<version>.zip — Agda builtin sources plus their compiled
 *                               .agdai interfaces, in the exact layout served
 *                               as static/als/<version>/agda-data.zip
 *
 * To upgrade ALS: publish new assets to the release (or a new tag and update
 * ALS_RELEASE here), then set the new version numbers in deploy.config.json.
 */

const ALS_RELEASE =
  'https://github.com/jim9292bb/agda-playground/releases/download/als-runtime'

/** The ALS version used by local tooling (dependency-graph extraction via
 *  Cmd_tokenHighlighting). Graph extraction is purely lexical, so one recent
 *  version works for every library regardless of the profile's ALS version. */
export const GRAPH_ALS_VERSION = '2.8.0'

export const alsWasmFilename = (version) => `als-${version}.wasm`
export const alsWasmUrl = (version) => `${ALS_RELEASE}/${alsWasmFilename(version)}`
export const agdaDataZipUrl = (version) => `${ALS_RELEASE}/agda-data-${version}.zip`

export async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}
