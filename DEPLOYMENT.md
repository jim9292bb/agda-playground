# Deployment

## Quick start

To deploy using this project's own shipped defaults — three ready-to-use
profiles, each pairing one ALS version with a compatible stdlib + Cubical
version:

- ALS 2.8.0 + stdlib 2.3 + Cubical 0.9 + agda-categories 0.3.0
- ALS 2.7.0.1 + stdlib 2.2 + Cubical 0.8
- ALS 2.6.4.3 + stdlib 2.1 + Cubical 0.7

```sh
git clone https://github.com/jim9292bb/agda-playground.git
cd agda-playground/als-demo
npm install
npm run auto-configure
npm run setup
npm run build
```

`npm install` also installs the local ALS graph tool (postinstall; a failed
download only warns). `auto-configure` downloads the shipped libraries,
creates `deploy.config.json`, and fetches prebuilt `.agdai` files. `setup`
downloads the ALS runtime assets (wasm + agda-data) for every version in
`deploy.config.json` straight into `static/als/` from this project's
[`als-runtime` release](https://github.com/jim9292bb/agda-playground/releases/tag/als-runtime),
then packages everything into `static/`. To run locally instead of
deploying, use `npm run dev` — the app will be available at `http://localhost:8099`.

## Custom deployment

Use this path to deploy with different libraries or a different ALS version.

**Step 1: Clone and install**

```sh
git clone https://github.com/jim9292bb/agda-playground.git
cd agda-playground/als-demo
npm install
```

**Step 2 (Optional): Build `.agdai` cache**

```sh
npm run build-agdai -- <path/to/lib.agda-lib> <agdai-dir> [--libraries-file <path>] [--agda-bin <path>]
```

`<path/to/lib.agda-lib>` and `<agdai-dir>` are positional and both required.  
`<agdai-dir>` (e.g. `/path/to/agdai-cache/<name>`): the exact value you'll
set as `agdaiDir` in Step 3. `build-agdai` creates it and populates
it with a `_build/` subdirectory — `.agdai` files don't land directly in
`<agdai-dir>`, they're one level deeper, at
`<agdai-dir>/_build/<version>/agda/...`.  
`--libraries-file`: a file listing one `.agda-lib` path per line, for
resolving the library's own dependencies (needed if it has a `depend:` on
another library, e.g. agda-categories on the standard library); omit to let
agda fall back to `~/.agda/libraries`.  
`--agda-bin`: path to the `agda` binary (default: `agda` on `PATH`).

Run once per library — there's no batch mode. First-time builds take ~8 min
for stdlib.

Since it's standalone, `build-agdai` is also handy for one-off builds or
testing a library against a different Agda version without touching
`deploy.config.json` at all — just point `<agdai-dir>` at a scratch directory.

**Step 3: Configure `deploy.config.json`**

```sh
cp deploy.config.example.json deploy.config.json
```

Set `"als"` to one of the [supported ALS versions](#supported-als-versions),
set `agdaLibPath` for each library, and — if you built a cache in Step 2 —
set `agdaiDir` to the same output directory you used there.
See [`deploy.config.json` schema](#deployconfigjson-schema) below.

`npm run setup` downloads each referenced version's `als-<version>.wasm` and
`agda-data.zip` straight into `static/als/<version>/` — no separate ALS
install step. Once `agdaiDir` is set, check the cache status at any time with:

```sh
npm run agdai-status
```

**Step 4: Build**

```sh
npm run setup
npm run build
```

To run locally instead of deploying, use `npm run dev` — the app will be
available at `http://localhost:8099`.

## Reference

### Supported ALS versions

The `als` field in `deploy.config.json` accepts exactly the versions
published as assets of this project's
[`als-runtime` release](https://github.com/jim9292bb/agda-playground/releases/tag/als-runtime):

| `als` value | Agda / ALS version | Suggested libraries |
|---|---|---|
| `"2.8.0"` | Agda 2.8.0 | stdlib 2.3, cubical 0.9, agda-categories 0.3.0 |
| `"2.7.0.1"` | Agda 2.7.0.1 | stdlib 2.1.1–2.3, cubical 0.8 |
| `"2.6.4.3"` | Agda 2.6.4.3 | stdlib 2.1, cubical 0.7 |

Any other value makes `npm run setup` fail when it tries to download
`als-<version>.wasm` from the release. To add a version, publish its
`als-<version>.wasm` + `agda-data-<version>.zip` pair to the release first
(see the release notes for the asset format and provenance).

**Known cross-version behavior differences:**

- **Auto (`Cmd_autoOne`)**: Agda 2.7.0 replaced the old term synthesizer
  _Agsy_ with a new implementation, _Mimer_ ([2.7.0 release notes](https://agda.readthedocs.io/en/v2.7.0/tools/auto.html),
  marked `[Breaking]`). ALS 2.6.4.3 still uses Agsy; ALS 2.7.0.1 and 2.8.0
  use Mimer. Mimer is strictly more capable — Agsy is known to fail on
  goals Mimer solves instantly (confirmed: a trivial `idN n = {! !}` case
  that 2.7.0.1/2.8.0 solve in under a second returns no solution on
  2.6.4.3). Auto does not hang, it just may not find an answer that newer
  versions do.
- **Diagnostic message format**: Agda 2.7.0 changed error/warning position
  formatting from comma-separated (`7,16-17`) to period-separated with an
  embedded error code (`7.16-17: error: [NotInScope]`), to comply with the
  GNU error message standard. The app's diagnostics parser
  (`src/lib/agda/diagnostics.js`) handles both formats.

### `deploy.config.json` schema

`deploy.config.json` (repo root, gitignored) is plain JSON. Created from
`deploy.config.example.json` by `auto-configure`, or manually:

```sh
cp deploy.config.example.json deploy.config.json
```

Example:

```json
{
  "profiles": [
    {
      "label": "stdlib + cubical (ALS 2.8.0)",
      "als": "2.8.0",
      "libraries": [
        {
          "agdaLibPath": "/path/to/agda-stdlib/standard-library.agda-lib",
          "label": "stdlib",
          "version": "2.3",
          "agdaiDir": "/path/to/agdai-cache/standard-library-2.3"
        },
        {
          "agdaLibPath": "/path/to/cubical/cubical.agda-lib",
          "label": "cubical",
          "version": "0.9",
          "agdaiDir": "/path/to/agdai-cache/cubical-0.9"
        }
      ]
    }
  ]
}
```

**`profiles`** — a flat list of ALS/library combinations. Each option is
valid by construction, so the UI only needs a single profile selector. The
list order matters: the first entry is the profile every visitor sees
selected by default until they pick a different one (persisted afterward in
their browser's local storage).

| Field | Required | Description |
|---|---|---|
| `label` | yes | Display name in the profile selector. Must be unique — used as the profile's identity in the UI and local storage |
| `als` | yes | Agda version number — must be one of the [supported ALS versions](#supported-als-versions). `npm run setup` downloads `als-<version>.wasm` and `agda-data.zip` for it from the `als-runtime` release into `static/als/<version>/` |
| `libraries` | yes | List of library entries — see below |

Each entry in `libraries`:

| Field | Required | Description |
|---|---|---|
| `agdaLibPath` | yes | Absolute path to the library's `.agda-lib` file. The library `name` is parsed from its `name:` line |
| `label` | no | UI display name. Falls back to the parsed `name:` value if absent |
| `version` | no | Version string shown in the UI. Cosmetic only |
| `agdaiDir` | no | When present, enables `.agdai` prefetching for this library. The directory `build-agdai` writes its `_build/` output to — not `_build/` itself, one level up from it (if you ran `agda --build-library` by hand instead of `build-agdai`, point this at the directory containing agda's own `_build/`). Accepts an absolute path or a path relative to repo root. Check status any time with `agdai-status` |

### Scripts

| `npm run` | Description |
|---|---|
| `auto-configure` | Downloads this project's shipped default libraries, creates `deploy.config.json`, fetches prebuilt `.agdai` files |
| `setup` | Downloads ALS runtime assets into `static/als/` per `deploy.config.json`, generates dependency-graph manifests, then packages everything into `static/` for serving |
| `build-agdai` | Compiles `.agdai` files with native agda, independent of `deploy.config.json`: `npm run build-agdai -- <lib-file> <agdai-dir> [--libraries-file <path>] [--agda-bin <path>]`. Pass a library's `agdaiDir` as `<agdai-dir>` to feed its prefetch cache |
| `agdai-status` | Shows manifest and cache status for each configured library |
