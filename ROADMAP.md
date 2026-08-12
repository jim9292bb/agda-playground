# Agda Playground Roadmap

This roadmap tracks work for a browser-hosted, single-file Agda playground for
teaching, demonstrations, and practice. The project takes a similar approach to the
JSCoq scratchpad: focused interaction with one source buffer, not development of
a multi-file Agda project.

`banacorn/agda-mode-vscode` is a reference for Agda interaction behavior,
shortcut semantics, and request/response handling. It is not the product
roadmap, and this project does not aim for complete VSCode parity.

Use [PROJECT_GOAL.md](PROJECT_GOAL.md) for product scope and
[docs/AGDA_MODE_VSCODE_MAPPING.md](docs/AGDA_MODE_VSCODE_MAPPING.md) for
researched Agda command mappings.

## Scope Boundaries

- [x] Preserve the single-file playground model backed by `/source.agda`.
- [x] Treat Cubical Agda and the standard library as preloaded runtime assets, not as project-management features.
- [ ] Do not add multi-file editing.
- [ ] Do not add a file explorer.
- [ ] Do not add an open package manager UI (arbitrary user-supplied library
      formats, dependency resolution, or a library registry). A bounded
      file-server-origin override (see "Custom File Server / Library Source")
      is an explicit, scoped exception to this line, not a contradiction of it.
- [ ] Do not add project/workspace configuration UI.
- [ ] Do not port Agda executable download or version switching unless multiple WASM runtimes are intentionally supported.
- [ ] Do not port VSCode-specific Markdown preview or editor-workspace keybindings.
- [ ] Do not split `deploy-assets/` into its own repository. `src/lib/runtime/interface.ts`
      imports `deploy-assets/generated-libraries.mjs` directly at build
      time, not just during CI — it's a build-time dependency of the
      app, not standalone tooling that happens to live alongside it. A
      split would trade that zero-friction same-repo import for npm/git
      submodule version-pinning overhead, with no actual external consumer
      to justify it.

## Development Priorities

1. Correctness of the Agda interaction lifecycle.
2. Clear goal and context display.
3. Reliable Agda shortcuts for exercises.
4. Good diagnostics and query output.
5. Unicode input suitable for Agda practice.
6. Browser regression coverage for common teaching examples.
7. UI polish that keeps the playground simple.

## Runtime and Library Support

Goal: examples should load reliably in a browser without local Agda installation.

- [x] Load ALS/Agda `2.8.0` from WASM.
- [x] Preserve existing standard-library behavior.
- [x] Add Cubical Agda `v0.9` as a static runtime asset.
- [x] Extract Cubical into the virtual filesystem at startup.
- [x] Register Cubical in Agda library configuration.
- [x] Set the default source to a minimal Cubical example.
- [x] Show Cubical `v0.9` in startup configuration.
- [x] Add a scripted Cubical regression that loads `Cubical.Foundations.Prelude`.
- [x] Add a scripted standard-library regression that loads `Data.Nat.Base`.
- [x] Show a read-only runtime summary for Agda, ALS, stdlib, and Cubical versions.

## Runtime and Library Performance

Goal: make ALS/WASM startup and library loading measurable before changing the
runtime architecture.

- [x] Add timing instrumentation for WASM response fetch, ALS worker initialization, library zip fetch, library extraction, Agda setup, source sync, `Cmd_load`, and token highlighting.
- [x] Add drive proxy call and byte counters around Agda load commands.
- [x] Add drive proxy method timing, top path, and `.agda` / `.agdai` profiling around `Cmd_load`.
- [x] Add double-load profiling for Cubical Prelude to compare first and second `Cmd_load`.
- [x] Add a default-off `pathStat` cache experiment switch for local benchmarking.
- [x] Add an isolated runtime/filesystem benchmark harness with a `runno-direct-fs` adapter scaffold.
- [x] Add a `runno-proxy-current` runtime/filesystem baseline that matches the main app drive proxy architecture.
- [x] Show collected performance timings in the runtime/info panel.
- [x] Browser-test that startup and library preparation timings are visible.
- [ ] Evaluate pathStat-heavy lookup optimization in the WASI drive proxy.
- [x] Add an experiment-only `runno-proxy-current --pathstat-cache` benchmark.
- [ ] Evaluate persistent IndexedDB caching for extracted stdlib and Cubical files.
- [ ] Evaluate lazy library extraction instead of eager JSZip inflation.
- [ ] Evaluate prebuilt `.agdai` interface caches for selected teaching examples.
- [ ] Resolve the `runno-direct-fs` raw ALS `ResponseEnd` blocker or replace it with a better direct baseline.
- [ ] Evaluate direct in-memory FS or memfs-style architecture experiments against Runno drive proxy overhead.
- [x] Add a `vscode-wasm-memfs` dependency/artifact probe and blocker report.
- [x] Add a benchmarkable `browser-wasi-shim-memfs` runtime/filesystem adapter.
- [x] Add a benchmarkable `browser-wasi-shim-overlay-snapshot` runtime/filesystem adapter.
- [x] Compare `runno-proxy-current`, `browser-wasi-shim-memfs`, and `browser-wasi-shim-overlay-snapshot` benchmark results.
- [x] Document the runtime/filesystem comparison conclusion.
- [x] Add a main-app runtime backend selector scaffold.
- [x] Add a behavior-preserving runtime backend abstraction around the current `runno-proxy-current` path.
- [x] Port `browser-wasi-shim-memfs` into the main app behind the runtime backend selector.
- [x] Browser-test library loading with both runtime backends. — moot:
      `runno-proxy-current` was fully removed; `browser-wasi-shim-memfs` is
      the sole backend (no selector exists in the UI anymore), so there's
      only one backend to browser-test — already covered by the regular
      `test:browser:libraries`/`test:browser:library-cache-profile` suites.
- [x] Decide whether `browser-wasi-shim-overlay-snapshot` is worth porting
      after the simpler memfs backend works. — decided no: memfs became the
      sole backend; overlay-snapshot was never ported into the main app.

## Curated Multi-Library Support

Goal: let users pick from a small, project-curated set of well-known Agda
libraries beyond stdlib/cubical — concrete motivating examples: `agda/agda-categories`,
`plfa/plfa.github.io`, `UniMath/agda-unimath`, `plt-amy/1lab` (verify exact repo
coordinates before implementing), and multiple versions of a given library.
This replaces an earlier, more open-ended "point at any custom file server
URL" design (see git history of this file). That design was scoped for
letting users self-host an *untrusted* alternate origin, which needs a
trust/warning/hash-pinning model. The actual need here doesn't require
that: every library in the curated set is still built and served by this
project's own CI from the same trusted origin as stdlib/cubical today —
users are choosing from a menu, not supplying an arbitrary external server.
No new trust boundary, no hash pinning, no warning dialogs needed.

Self-deployers configure which Agda environment combinations their
deployment offers via `deploy.config.json` (repo root, gitignored, plain
JSON — see `DEPLOYMENT.md`'s "`deploy.config.json` schema" section for the
field docs). The schema is a flat list of `profiles`; each profile is a
complete, ready-to-use combination (one ALS version + a compatible library
set), not a separate "pick an ALS version" + "pick a library set" pair of
independent choices — every option is valid by construction, so there's
nothing to cross-reference or filter in the UI. Everything under
`.deploy-assets/` reads from it via `scripts/resolve-deploy-config.mjs`
instead of hardcoding stdlib/cubical. The shipped defaults
(`npm run auto-configure`) reproduce this project's own deployment across
all three supported ALS versions — see `DEPLOYMENT.md` for the current
version/library matrix.

Done (condensed — see git history for the full step-by-step record):

- [x] Generalized the whole asset pipeline (manifest generation, `.agdai`
      caching, static packaging, runtime library resolution) from a
      hardcoded stdlib/cubical pair to a `deploy.config.json`-driven list of
      profiles, each an (ALS version, library set) combination.
- [x] Added a "Deployment profile" selector to Settings → Runtime and
      libraries; `AgdaController.switchProfile()` restarts the worker with
      the selected profile's ALS version + libraries.
- [x] Proved the system generalizes past stdlib/cubical by adding
      agda-categories 0.3.0 as a third library, including prebuilding and
      publishing its `.agdai` cache and fixing several bugs the addition
      surfaced (cross-library dependency attribution, coinfective-import
      options handling, an on-demand `.agdai`-fetch path that only
      recognized the original two libraries' cache directories).
- [x] Replaced the `Everything.agda`/native-`--dependency-graph` manifest
      pipeline with a `Cmd_tokenHighlighting`-based import scanner
      (`scripts/generate-manifest.mjs`) that reads each file's direct
      imports without needing a synthetic combined entry point or resolving
      any imports — faster, and fixed a latent accuracy bug where the old
      pipeline's `.dot` output had already been transitively reduced.
      Manifests are now split one-per-library under
      `static/agdai/<name>/agdai-manifest.json`.
      `scripts/build-agdai-cache.mjs` covers `.agdai` cache generation on
      native `agda` versions without `--build-library`, using a
      provably-minimal source-vertex covering set.
- [x] Simplified the config format down from a two-file
      `deploy.config.mjs` + separate library/ALS catalog through several
      intermediate shapes to today's single flat `deploy.config.json`
      (repo root, gitignored, plain JSON — no catalog indirection; each
      profile lists its libraries and ALS version directly).
      `.deploy-assets/` now stages raw unzipped files (library source
      trees, `.agdai` caches, ALS wasm + `agda-data/`); `npm run setup`
      is responsible for zipping whatever the browser runtime fetches as a
      zip.
- [x] Extended to three ALS versions (2.8.0, 2.7.0.1, 2.6.4.3), each with
      its own stdlib + Cubical version and `.agdai` cache release — see
      `scripts/auto-configure.mjs`'s `SHIPPED_LIBRARIES`/`SHIPPED_PROFILES`
      and `DEPLOYMENT.md`'s supported-versions table.
- [x] Fixed stale browser-test selectors (Settings button lookup, error
      view tab, example picker) so `npm run test:browser` passes cleanly
      against the current UI.

- [x] Add a spec for plfa to `deploy.config.json` and a corresponding
      profile — done as an opt-in `npm run auto-configure -- --with-plfa`
      (see `scripts/auto-configure.mjs`'s `PLFA_LIBRARIES`/`PLFA_PROFILE`),
      not a fifth default profile, since its `.agdai` cache is much heavier
      (~285MB) than the others. Powers the `/plfa` notebook route — see
      "`als-demo`'s `/plfa` route" in the workspace root `CLAUDE.md` and
      `DEPLOYMENT.md`'s "Deploying to Vercel" section for the full story.
- [ ] Add specs for agda-unimath, 1lab to `deploy.config.json` (confirm each
      library's actual `.agda-lib` name/include path/required OPTIONS
      first), and add corresponding profile(s).
- [ ] A `deploy.config.json` validation step, run before `npm run setup`,
      checking the kinds of mistakes a deployer could otherwise only
      discover from a thrown error deep in the browser (e.g.
      `resolveProfileLibraries()`'s folderName/libraryName uniqueness
      checks in `src/lib/runtime/interface.ts`) — surfacing them up front
      instead, with a clear message, before any build/zip work happens.

Considered and rejected: having `npm run setup` skip libraries outside some
"default" profile. The runtime is already lazy where it matters — a browser
session only fetches its *active* profile's source zip
(`browser-wasi-shim.ts`'s `_fetchLibraryZips`), and `.agdai` files are
fetched per-file on demand via the prefetch manifest, never as a bulk zip.
`npm run setup` downloading every configured profile's libraries is a
one-time, deployer-side build cost (CI time / disk), not something any end
user pays for — not worth the added complexity.

## Notebook Routes (`/literate`, `/plfa`)

Two Jupyter-style notebook routes, both reusing the same N-EditorView
engine: a hidden "composite document" `EditorView` (what `AgdaController`
actually talks to — every existing Agda-interaction module keeps its
single-continuous-document assumption unchanged) synced bidirectionally
against N independent, visible per-cell `EditorView`s. See git history
(`literate-programming` branch, merged) for the step-by-step build order;
condensed status below.

Done:

- [x] `/literate` — "Agda Notebook": a general-purpose scratch notebook.
      Markdown and code cells, add/delete via toolbar, import/export a whole
      `.lagda.md` file, goal/highlight decorations projected into the
      correct cell, Give/Refine/MakeCase synced back to the correct visible
      cell. Cells default unfocused; clicking outside every cell unfocuses.
- [x] `/plfa` — "PLFA Notebook": read/edit *Programming Language Foundations
      in Agda* chapter-by-chapter, each chapter loadable as this notebook's
      own top-level document with the rest of the book mounted as a
      read-only library so cross-chapter `open import plfa.part1.Xxx`
      references resolve normally. Hierarchical chapter picker ordered to
      match the book's own reading order (`data/tableOfContents.yml`), not
      alphabetically.
- [x] `AppSwitcher` — a small nav component in all three routes' headers
      linking between Agda Playground / Agda Notebook / PLFA Notebook.
      PLFA's link only appears where a PLFA-capable profile actually exists
      (`deploy.config.json`'s `plfa: true` field — see `DEPLOYMENT.md`).
- [x] PLFA made deployable without manual local setup: `npm run
      auto-configure -- --with-plfa` fetches its stdlib/plfa sources and
      prebuilt `.agdai` cache the same way the other shipped profiles do —
      see "Curated Multi-Library Support" above and `DEPLOYMENT.md`'s
      "Deploying to Vercel" section.
- [x] Fixed a cell-sync race where editing one cell could silently drop
      another cell's goal/highlight decoration projection with no visible
      error: `cellSyncExtensions`' `updateListener` (`+page.svelte`) wrote
      the edited cell's `cells[idx].text` *after* dispatching to
      `hiddenView`, but `EditorView.dispatch()` re-enters
      `hiddenViewUpdateListener` synchronously before returning — so that
      listener's `computeCellContentOffsets(cells)` call read the pre-edit
      length for one pass, shifting the projection window for every cell
      after the edited one. The shifted window could clip a decoration to
      zero width or break `RangeSetBuilder`'s sort assumption, both of
      which throw inside `EditorView.updateListener` — an exception
      CodeMirror itself swallows, dropping that projection pass silently
      (see `projectRangeSetToWindow`'s comments in
      `literate-cell-sync.js`). Fixed by updating `cells[idx].text` before
      the `hiddenView` dispatch (commit `7e8b4bb`); regression-tested with
      `npm run test:browser:literate-cell-sync-race`, verified red on the
      pre-fix code and green on the fix (commit `72bedeb`).

Known gaps / not yet done:

- [ ] Hover tooltips (`src/lib/codemirror/`'s lsp-hover-related extensions)
      haven't been individually re-verified against the cell-local ↔
      hidden-document offset translation the N-EditorView rewrite
      introduced — flagged as a risk during the rewrite, not yet resolved
      one way or the other.
- [ ] No cell-based browser regression coverage exists for `/plfa`
      specifically (chapter switching, cross-chapter `open import`
      resolution) beyond the ad hoc "all 25 chapters Load" verification done
      during development — only `/literate`'s cell CRUD/truncation/basic
      flows have dedicated `test:browser:literate-*` scripts.

## Goal Lifecycle and Editor State

Goal: Agda goals should remain correct after load, edits, case split, give,
refine, auto, and asynchronous ALS responses.

- [x] Create a centralized goal state module.
- [x] Track each goal by Agda interaction point id.
- [x] Store each goal's outer range, inner range, input, and document version.
- [x] Map CodeMirror offsets to Agda UTF-8 ranges through one shared utility.
- [x] Update goal ranges after every CodeMirror document transaction.
- [x] Reject or rebase async Agda responses when the document version is stale.
- [x] Rebuild goal ids from Agda `InteractionPoints` after `Load`.
- [x] Merge existing and newly generated goals after `Give` and `Refine`.
- [x] Remove goal boundaries after successful `Give`.
- [x] Add defensive handling for damaged or partially edited goal boundaries.
- [x] Verify `Load` updates highlighting, diagnostics, warnings, and goals after the goal-state refactor.
- [x] Add browser regression coverage for damaged or partially edited goal boundaries.
- [x] Fixed Give/Refine results containing a bare `?` (e.g. refining a goal
      of type `N -> N` with the partial application `s` gives `s ?`, where
      `?` marks a fresh sub-goal Agda already knows about) not being
      registered as a new interaction point until a manual reload: Case
      split's `replaceGoalClause` already converted `?` → `{!   !}` and
      fired `'agda-reload-needed'` for its own generated clauses, but
      `replaceGoal`/`removeGoalBoundary` — the mutation functions
      `GiveAction`'s handler actually uses for Give/Refine — did not, so the
      new `?` sat as inert text with no Goals panel entry. Fixed by
      extracting a shared `convertBareGoalMarkers` helper in
      `editor-mutations.js` and wiring it into both functions (commit
      `445c1a1`); regression-tested with `npm run
      test:browser:give-embedded-goal` plus 3 new unit tests.
- [x] Fixed `Load`'s `?` → hole expansion using 2 spaces (`{!  !}`) instead
      of Agda's own 3-space convention (`{!   !}`, hardcoded in
      agda-mode-vscode's `Goals.res:832` and confirmed live against real
      ALS output) — an inconsistency within als-demo itself, since
      Give/Refine/Case-split's own `?` → hole conversion
      (`editor-mutations.js`) already used 3 spaces; only `goals.js`'s
      `expandedQuestionMarkGoal` constant (and its unused-in-production
      `expandGoals` sibling) used 2. Found via a full live comparison sweep
      of all 17 implemented commands against real `agda-mode-vscode` +
      ALS-WASM running in `vscode-test-web` (see
      `/home/jim/agda-scratchpad/agda-command-behavior-reference.md`).
      Fixed by changing the constant to 3 spaces; regression-tested by
      updating `test:browser:goal-lifecycle`'s Load assertion plus 4 unit
      tests.

## Core Practice Commands

Goal: common Agda exercise workflows should work from the editor with familiar
Agda shortcuts.

- [x] Keep `C-c C-l` wired to `Cmd_load`.
- [x] Wire `C-c C-Space` Give using `Cmd_give WithoutForce goalId range content`.
- [x] Wire `C-c C-c` Case split using `Cmd_make_case goalId range content`.
- [x] After Case split, replace the old goal with returned clauses and immediately reload.
- [x] Fixed Case split silently ignoring the `MakeCase` response's `variant`
      field (`Function` vs `ExtendedLambda`): `handlers.js`'s `MakeCase` case
      destructured only `{ clauses }` and always called `replaceGoalClause`
      with the "replace the whole line with new top-level clauses" strategy
      -- correct for a normal function clause, but for a goal inside an
      extended lambda (`λ { x -> {! !} }` or `λ where x -> {! !}`, e.g. used
      throughout PLFA's `Confluence.lagda.md`/`Substitution.lagda.md`) that
      inserted syntactically-broken new top-level declarations instead of
      `;`-separated clauses inside the braces. Ported agda-mode-vscode's
      `Goal.res` `caseSplitAux`/`replaceWithLambda` (searches backward from
      the goal for the nearest unmatched `{`, `;`, `where`, or line break to
      find the enclosing clause, then rewrites only that clause) as
      `findExtendedLambdaClauseStart`/`extendedLambdaClauseEdit` in
      `editor-mutations.js`, and threads `variant` through from
      `handlers.js`. Regression-tested with `npm run
      test:browser:case-split-extended-lambda` (verified red on the pre-fix
      code: it split `λ { x -> {! !} }` into broken new top-level lines) plus
      unit tests covering both the `{ }`-braces and `where`-clause forms.
- [x] Wire `C-c C-r` Refine using `Cmd_refine_or_intro False goalId range content`.
- [x] Replace provisional Auto behavior with real `Cmd_autoOne normalization goalId range content`.
- [x] Implement `C-c C-m` Elaborate and give using `Cmd_elaborate_give`.
- [x] Implement `C-c C-h` Helper function type using `Cmd_helper_function`.
- [x] Show a clear error when a command requires content but the current goal is empty.
- [x] Show a clear error when the cursor is not inside a goal.
- [x] Extract core command construction into `src/lib/agda/commands.js`.
- [x] Browser-test Load, Give, Case split, Refine, Auto, Elaborate and give, and Helper function type with `agent-browser` scripts.

## Goal Queries and Exploration

Goal: learners should be able to inspect goal type, context, inferred types,
normal forms, scope, and module contents without leaving the playground.

- [x] Implement `C-c C-t` Goal type using `Cmd_goal_type`.
- [x] Implement `C-c C-e` Context using `Cmd_context`.
- [x] Wire `C-c C-,` Goal type and context using `Cmd_goal_type_context`.
- [x] Wire `C-c C-.` Goal type, context, and inferred type using `Cmd_goal_type_context_infer`.
- [x] Align `C-c C-,` and `C-c C-.` semantics with `agda-mode-vscode` naming and expected output.
- [x] Implement `C-c C-;` Goal type, context, and checked type using `Cmd_goal_type_context_check`.
- [x] Wire `C-c C-d` Infer type using `Cmd_infer`.
- [x] Wire `C-c C-n` Compute normal form using `Cmd_compute`.
- [x] Implement `C-c C-z` Search about using `Cmd_search_about_toplevel`.
- [x] Implement `C-c C-o` Module contents using `Cmd_show_module_contents`.
- [x] Fixed Module Contents silently dropping the queried module's own
      submodule list: ALS's `ModuleContents` response sends `names` (the
      submodules) alongside `contents` (the module's typed names), but
      `handlers.js`'s `ModuleContents` case rendered only
      `formatNameTermList(info.contents)`, never reading `info.names` --
      the query looked complete (no error) but silently omitted data for any
      module containing submodules. Upstream's `EmacsTop.hs`
      (`Info_ModuleContents`) renders both as a "Modules" section above a
      "Names" section; added `formatModuleContents` in `handlers.js` to do
      the same, only when `names` is non-empty (so a query on a leaf module,
      the common case, renders unchanged). Regression-tested with `npm run
      test:browser:module-contents-submodules` (verified red on the pre-fix
      code: the "Modules:" section was entirely absent) plus 2 new unit
      tests.
- [x] Fixed Search About / Module Contents rendering `name : type` entries
      with no column alignment, unlike real agda-mode-vscode which pads
      names to the widest one so every `:` lines up (confirmed via live
      `vscode-test-web` comparison: `_+_     : ...` / `bar     : ...` style
      alignment) -- als-demo's shared `formatNameTermList` in `handlers.js`
      previously did a flat `${name} : ${term}` per line. Sort order and
      content were already correct; this was purely cosmetic. Fixed by
      padding each name to the widest name's length before formatting;
      regression-tested with `npm run test:browser:search-about-alignment`
      (verified red on the pre-fix code) plus 2 new unit tests.
- [x] Implement `C-c C-w` Why in scope using `Cmd_why_in_scope`.
- [x] Extract query command construction into `src/lib/agda/commands.js`.
- [x] Move query results from the raw log into a structured Queries panel.
      (`.queries-panel`/`queriesPanel()` snippet in `+page.svelte`, backed by
      `agdaController.queryResults`.)
- [x] Render query results without losing Agda formatting. (`<pre
      class="query-result-content">` preserves whitespace.)
- [x] Browser-test query shortcuts with reusable fixtures.
      (`scripts/browser-test-query-shortcuts.sh` uses
      `test-fixtures/agda/query-bool.agda`.)

## Goals Panel and Navigation

Goal: the Goals panel should be the main practice aid for single-file proof and
program construction.

- [x] Show current goals below the editor.
- [x] Make Goals panel entries clickable.
- [x] Move the editor cursor into the selected goal when a goal is clicked.
- [x] Add Next goal command.
- [x] Add Previous goal command.
- [x] Add browser regression coverage for Next/Previous goal navigation
      (`test:browser:goal-navigation`), including wrap-around at both ends --
      previously the only implemented command with no browser test on either
      the als-demo or agda-mode-vscode side (see
      docs/AGDA_MODE_VSCODE_MAPPING.md's Test Coverage by Command table).
- [x] Show goal ids in the editor as CodeMirror decorations.
- [x] Highlight the active goal.
- [x] Keep the Goals panel synchronized after edits, Load, Give, Refine, and Case split.
- [x] Display goal type and context for the active goal.
- [x] Add a browser regression for active goal type/context display.
- [ ] Consider a compact mode for examples with many goals.

## Command Input Panel

Goal: when a command needs text and the active goal is empty, users should be
able to type the required content in a panel, similar to the useful parts of
`agda-mode-vscode`'s goal input workflow.

- [x] Add a panel prompt for commands that require input when the active goal is empty.
- [x] Use the prompt result as command content for Case split, Give, Refine, Elaborate and give, Helper function type, Infer, Compute, Search, Module contents, Why in scope, and checked-type queries.
- [x] Allow cancelling the prompt without sending an Agda command.
- [x] Restore editor focus after prompt submit or cancel.
- [x] Support Agda Unicode input method inside the prompt after the Unicode input method exists.
- [x] Add browser regressions for prompt submit, cancel, and focus restore.

## Shortcut Configuration

Goal: Agda shortcuts should work for learners by default, while still allowing
users to replace bindings that conflict with their browser, operating system, or
keyboard layout.

- [x] Centralize shortcut definitions in a data-driven registry instead of scattering hard-coded key checks through UI event handlers.
- [x] Keep the default bindings aligned with familiar Agda mode shortcuts where practical.
- [x] Add a floating Settings dialog with a shortcut settings section.
- [x] Add a lightweight shortcut settings UI for replacing command bindings.
- [x] Validate replacement bindings and warn about duplicate Agda command shortcuts.
- [x] Persist shortcut overrides in browser local storage.
- [x] Add a reset-to-default-shortcuts action.
- [x] Make shortcut help render from the same registry used by the dispatcher.
- [x] Add a collapsible, scrollable Commands panel rendered from the shortcut registry.
- [x] Browser-test overridden shortcuts for representative command classes.
- [x] Browser-test an overridden Load shortcut.
- [x] Browser-test an overridden goal command shortcut.
- [x] Browser-test an overridden query command shortcut.

## Diagnostics and Output Panels

Goal: errors, warnings, logs, and query results should be readable for learners
and not buried in raw transport output.

- [x] Parse Agda errors into structured diagnostics.
- [x] Show file, line, and column for errors.
- [x] Allow clicking an error to jump to its source position.
- [x] Handle `JumpToError` responses by moving the editor cursor to the reported position.
- [x] Add a Messages panel with switchable Log and Errors views.
- [ ] Separate output into Log, Goals, Queries, Warnings, and Errors.
- [ ] Preserve raw Agda output behind a debug view.
- [ ] Add an internal debug panel for request/response tracing.
- [x] Add teaching-oriented examples for syntax errors and semantic errors.

## Unicode Input Method

Goal: learners should be able to type Agda symbols in the browser without an
external editor setup.

- [x] Add Agda input method triggered by backslash.
- [x] Use `../references/agda-mode-vscode/asset/keymap.js` as the trie source.
- [x] Show a floating two-row tooltip: Row 1 = candidate symbols, Row 2 = key suggestions for continuing input.
- [x] Support selecting candidates with keyboard navigation (← → move one by one, ↑ ↓ page through 9 per page, 1–9 select by position).
- [x] Replace the input sequence with the chosen Unicode symbol.
- [x] Ensure Agda shortcuts still have priority while the editor is focused.
- [x] Support Agda Unicode input inside the command input prompt.
- [ ] Add a lookup command similar to `C-x C-=`.
- [x] Browser-test Unicode input method flows.

## Normalization and Command Variants

Goal: expose useful Agda command variants without copying VSCode's exact prefix
UI when it does not fit the browser playground.

- [ ] Support AsIs normalization.
- [ ] Support Simplified normalization.
- [ ] Support Instantiated normalization where supported.
- [ ] Support Normalised normalization.
- [ ] Support HeadNormal normalization.
- [ ] Add a browser-friendly alternative to VSCode's `C-u` prefix flow.
- [ ] Apply normalization variants to Goal type, Context, Auto, Compute, Search, and Constraints.

## Constraints and Metas

Goal: expose constraints and metas only where they help learning and debugging
single-file exercises.

- [ ] Implement Show constraints using `Cmd_constraints`.
- [ ] Implement Solve one constraint using `Cmd_solveOne`.
- [ ] Implement Solve all constraints using `Cmd_solveAll`.
- [ ] Implement Show goals/metas using `Cmd_metas`.
- [ ] Display constraints in a structured panel.
- [ ] Handle Agda version differences in command syntax.

## Playground UX and Teaching Examples

Goal: the default experience should support demos and short practice sessions.

- [x] Add a small example picker for built-in single-file examples.
- [x] Move the example picker into the editor header as a compact selector.
- [x] Include examples for natural numbers, case split, auto, refine, queries, Cubical import, and standard-library import.
- [x] Keep examples as single buffers, not as multi-file projects.
- [x] Apply selected examples immediately without a separate example load or reset button.
- [ ] Keep debug output hidden by default.
- [ ] Make shortcut help easier to scan for beginners.

## Browser Regression Suite

Goal: common playground workflows should be repeatable by AI coding agents and humans.

- [x] Add reusable Agda fixtures under `test-fixtures/agda/`.
- [x] Add shared `agent-browser` helper functions.
- [x] Add browser regression script for goal lifecycle basics.
- [x] Add browser regression script for damaged or partially edited goal boundaries.
- [x] Add browser regression script for Load state refresh across highlighting, diagnostics, warnings, and goals.
- [x] Add browser regression script for the collapsible Commands panel.
- [x] Add browser regression script for the Settings dialog shell.
- [x] Add browser regression script for Auto.
- [x] Add browser regression script for query shortcuts.
- [x] Add browser regression script for command input panel submit, cancel, and focus restore.
- [x] Add browser regression script for active Goals panel details.
- [x] Add browser regression script for Cubical load.
- [x] Add browser regression script for standard-library load.
- [x] Add browser regression script for syntax and semantic error display.
- [x] Expose browser regressions through `package.json` scripts where practical.

## AI-Assisted Workflow and Methodology

Goal: keep AI-assisted development predictable without making the repository
depend on agent-specific tooling.

- [x] Document plugin and MCP usage for this workspace.
- [x] Document lightweight Superpowers-inspired development practices.
- [x] Add spec-first, systematic debugging, verification, and review checklists.
- [ ] Keep workflow documentation synchronized when new browser regressions or
      major development phases are added.

## Implementation Notes

- Prioritize single-file learning workflows over project-oriented IDE features.
- Prioritize goal lifecycle correctness before adding more shortcuts.
- Treat `InteractionPoints` as the source of truth for Agda goal ids.
- Treat CodeMirror document changes as the source of truth for current ranges.
- Always reload after Case split so new holes receive real Agda interaction point ids.
- Avoid command-specific hacks that search raw `{! !}` text without consulting goal state.
- Route all keyboard shortcuts through the shortcut registry once shortcut configuration exists.
- Keep request construction separate from UI event handling.
- Keep response handling separate from editor mutation.
- Use `agda-mode-vscode` as an interaction reference, not as a parity checklist.
- Include browser tests for any editor, shortcut, goal, or panel behavior change.

## References

- [PROJECT_GOAL.md](PROJECT_GOAL.md)
- [docs/AGDA_MODE_VSCODE_MAPPING.md](docs/AGDA_MODE_VSCODE_MAPPING.md)
- https://coq.vercel.app/scratchpad.html
- https://github.com/banacorn/agda-mode-vscode/blob/master/package.json
- https://github.com/banacorn/agda-mode-vscode/blob/master/src/Request.res
- https://github.com/banacorn/agda-mode-vscode/blob/master/src/Goals.res
- https://github.com/banacorn/agda-mode-vscode/blob/master/src/State/State__Command.res
- https://github.com/banacorn/agda-mode-vscode/blob/master/src/State/State__Response.res
