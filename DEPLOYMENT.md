# Deployment

## Quick start

To deploy using this project's own shipped defaults (stdlib 2.3, Cubical 0.9,
agda-categories 0.3.0, ALS 2.8.0):

```sh
git clone https://github.com/jim9292bb/agda-playground.git
cd agda-playground/als-demo
npm install
npm run auto-configure
npm run setup
npm run build
```

`auto-configure` downloads all libraries and ALS, creates `deploy.config.json`,
and fetches prebuilt `.agdai` files. `setup` generates dependency-graph
manifests and packages everything into `static/`. To run locally instead of
deploying, use `npm run dev` — the app will be available at `http://localhost:8099`.

## Custom deployment

Use this path to deploy with different libraries or a different ALS version.

**1. Clone and install:**

```sh
git clone https://github.com/jim9292bb/agda-playground.git
cd agda-playground/als-demo
npm install
```

**2. Install ALS:**

```sh
npm run install-als -- /path/to/als.wasm --name als-2.8ext
```

Downloads agda-data from Hackage, compiles builtins, and installs everything
into `.deploy-assets/.als/als-2.8ext/`.

**3. Configure `deploy.config.json`:**

```sh
cp deploy.config.example.json deploy.config.json
```

Set `"als"` to the name from step 2 and set `agdaLibPath` for each library.
See [`deploy.config.json` schema](#deployconfigjson-schema) below.

**4. (Optional) Build `.agdai` cache:**

```sh
npm run build-agdai -- --lib-file <path/to/lib.agda-lib> --agda-bin <path>
```

`--lib-file`: process only this library (default: all libraries with `agdaiDir` set).  
`--agda-bin`: path to the `agda` binary (default: `agda` on `PATH`).

First-time builds take ~8 min for stdlib. Check what's ready at any time:

```sh
npm run agdai-status
```

**5. Build:**

```sh
npm run setup
npm run build
```

To run locally instead of deploying, use `npm run dev` — the app will be
available at `http://localhost:8099`.

## Reference

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
      "als": "als-2.8ext",
      "libraries": [
        {
          "agdaLibPath": "/path/to/agda-stdlib/standard-library.agda-lib",
          "label": "stdlib",
          "version": "2.3",
          "agdaiDir": ".deploy-assets/auto/agdai/standard-library-2.3"
        },
        {
          "agdaLibPath": "/path/to/cubical/cubical.agda-lib",
          "label": "cubical",
          "version": "0.9",
          "agdaiDir": ".deploy-assets/auto/agdai/cubical-0.9"
        }
      ]
    }
  ]
}
```

**`profiles`** — a flat list of ALS/library combinations. Each option is
valid by construction, so the UI only needs a single profile selector.

| Field | Required | Description |
|---|---|---|
| `label` | yes | Display name in the profile selector. Must be unique — used as the profile's identity in the UI and local storage |
| `als` | yes | ALS directory name under `.deploy-assets/.als/` |
| `libraries` | yes | List of library entries — see below |

Each entry in `libraries`:

| Field | Required | Description |
|---|---|---|
| `agdaLibPath` | yes | Absolute path to the library's `.agda-lib` file. The library `name` is parsed from its `name:` line |
| `label` | no | UI display name. Falls back to the parsed `name:` value if absent |
| `version` | no | Version string shown in the UI. Cosmetic only |
| `agdaiDir` | no | When present, enables `.agdai` prefetching for this library. Path to the directory containing `.agdai` files and `agdai-manifest.json`. Accepts an absolute path or a path relative to repo root. Paths outside the repo must be gitignored manually |

### Scripts

| `npm run` | Description |
|---|---|
| `auto-configure` | Downloads this project's shipped defaults (libraries + ALS), creates `deploy.config.json`, fetches prebuilt `.agdai` files |
| `generate-manifest` | Generates dependency-graph manifests from library source using ALS WASM. Auto-detects ALS from `deploy.config.json`; supports `--lib-file <path>`, `--wasm <als-name>`, `--agda-bin <path>`. Also runs automatically before `setup` |
| `setup` | Generates dependency-graph manifests (via `generate-manifest`), then packages everything into `static/` for serving |
| `install-als` | Installs an ALS WASM build: `npm run install-als -- <path-to-als.wasm> --name <als-name> [--force]`. `--force` overwrites an existing install with the same name |
| `remove-als` | Removes an installed ALS build: `npm run remove-als -- <als-name>` |
| `list-als` | Lists installed ALS builds. Pass `--hash` to also print the SHA-256 of the `.wasm` file |
| `build-agdai` | Compiles `.agdai` files with native agda (or ALS WASM) and writes them to the library's `agdaiDir`. Supports `--lib-file <path>`, `--agda-bin <path>`, `--wasm <als-name>` |
| `remove-agdai` | Removes the `.agdai` cache and manifest for a library: `npm run remove-agdai -- <path/to/lib.agda-lib>` |
| `agdai-status` | Shows manifest and cache status for each configured library |
