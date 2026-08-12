# agda-mode-vscode Mapping

This document records the `banacorn/agda-mode-vscode` behavior already researched
for this browser-hosted single-file Agda playground IDE. Use it before searching
`../references/`.

## References

- `../references/agda-mode-vscode/package.json`: keybindings.
- `../references/agda-mode-vscode/src/Request.res`: Agda request encoding.
- `../references/agda-mode-vscode/src/State/State__Command.res`: command input and fallback behavior.
- `../references/agda-mode-vscode/test/tests`: behavior fixtures and expected responses.

## Core Commands

| Shortcut | agda-mode-vscode command | Browser command |
| --- | --- | --- |
| `C-c C-l` | Load | `Cmd_load` through ALS load flow |
| `C-c C-Space` | Give | `Cmd_give WithoutForce goalId range content` |
| `C-c C-c` | Case split | `Cmd_make_case goalId range content` |
| `C-c C-r` | Refine | `Cmd_refine_or_intro False goalId range content` |
| `C-c C-a` | Auto `[AsIs]` | `Cmd_autoOne AsIs goalId range content` |
| `C-c C-m` | Elaborate and give `[Simplified]` | `Cmd_elaborate_give Simplified goalId noRange content` |
| `C-c C-h` | Helper function type `[AsIs]` | `Cmd_helper_function AsIs goalId noRange content` |
| `C-c C-f` | Next goal | browser-side focus next goal |
| `C-c C-b` | Previous goal | browser-side focus previous goal |

## Query Commands

| Shortcut | agda-mode-vscode command | Browser command |
| --- | --- | --- |
| `C-c C-t` | Goal type `[Simplified]` | `Cmd_goal_type Simplified goalId noRange ""` |
| `C-c C-e` | Context `[Simplified]` | `Cmd_context Simplified goalId noRange ""` |
| `C-c C-,` | Goal type and context `[Simplified]` | `Cmd_goal_type_context Simplified goalId noRange ""` |
| `C-c C-.` | Goal type, context, inferred type `[Simplified]` | `Cmd_goal_type_context_infer Simplified goalId noRange content` |
| `C-c C-;` | Goal type, context, checked type `[Simplified]` | `Cmd_goal_type_context_check Simplified goalId noRange content` |
| `C-c C-d` | Infer type `[Simplified]` | `Cmd_infer Simplified goalId noRange content` |
| `C-c C-n` | Compute normal form | `Cmd_compute DefaultCompute goalId noRange content` |
| `C-c C-z` | Search about `[Simplified]` | `Cmd_search_about_toplevel Simplified content` |
| `C-c C-o` | Module contents `[Simplified]` | `Cmd_show_module_contents Simplified goalId noRange content` or top-level variant |
| `C-c C-w` | Why in scope | `Cmd_why_in_scope goalId noRange content` or top-level variant |

## Important Behavior

- `C-c C-.` falls back to `Cmd_goal_type_context` when the active goal content is empty.
- Commands that need content use the command input panel when the active goal or selection is empty.
- `C-c C-z` is naturally prompt-based in agda-mode-vscode. In this playground, it uses selected text or the command input panel.
- `C-c C-o` and `C-c C-w` support top-level selected text when the cursor is not inside a goal.
- `C-u` normalization prefix variants are not implemented yet; they are tracked in the roadmap.
- Always keep command string construction in `src/lib/agda/commands.js`.
- Keep shortcut definitions in `src/lib/agda/shortcuts.js`; UI code should dispatch by shortcut id rather than hard-coded key branches.

## Test Coverage by Command

Reference for where each command's behavior is already exercised in each of
the three implementations, so a consistency audit or a new test can start
from "what's covered" instead of re-deriving it. `—` means no dedicated test
was found; a command may still be covered incidentally by another test's
setup (e.g. every `load_and_wait`-based script exercises Load).

als-demo scripts live at `scripts/browser-test-*.sh` (run via `agent-browser`
against the real dev server + ALS WASM). agda-mode-vscode tests live at
`../references/agda-mode-vscode/test/tests/Test__*.res` (run via its own
VSCode extension test harness). Agda's own interaction golden tests live at
`../references/agda/test/interaction/*.in` (run via `make interaction`) --
these test the Emacs S-expression protocol directly; **agda2-mode.el itself
(the Emacs Lisp frontend) has no automated tests at all** (no `.el` test
file, no `ert-deftest` anywhere in the Agda repo).

| Shortcut | Command | als-demo browser test | agda-mode-vscode test | Agda interaction golden test |
| --- | --- | --- | --- | --- |
| `C-c C-l` | Load | (implicit in nearly every script via `load_and_wait`) | — | `Cmd_load_no_metas.in` |
| `C-c C-Space` | Give | `core-commands`, `damaged-goal-boundaries`, `goal-lifecycle`, `give-embedded-goal` | `Test__Give.res` | `GiveSharp`, `GiveSize`, `GiveWithForce`, `GiveInSpiteOfUnsolvedIrr` |
| `C-c C-c` | Case split | `core-commands`, `damaged-goal-boundaries`, `goal-lifecycle`, `case-split-extended-lambda`, `command-input-panel` | `Test__CaseSplit.res` | `CaseSplitAndImplicits`, `ExtendedLambdaCase`, `Multisplit`, `SplitOnHidden`, `SplitResult`, `SplitLetBound`, `SplitOnResultCopatternsDisabled`, `SplitPreserveInstanceProjection`, `unicodelambdasplit` |
| `C-c C-r` | Refine | `core-commands`, `refine-intro` | `Test__Refine.res` | `IntroHIT`, `IntroSharp` (intro fallback) |
| `C-c C-a` | Auto | `core-commands`, `auto` | `Test__Auto.res` | `Auto-IndexedDatatypes`, `Auto-Modules`, `Allto`, `test/interaction/Auto/`, `Mimer-BasicLogic`, `Mimer-Misc` |
| `C-c C-m` | Elaborate and give | `core-commands` | `Test__ElaborateAndGive.res` | `ElaborateGive` |
| `C-c C-h` | Helper function type | `core-commands` | `Test__HelperFunctionType.res` | — |
| `C-c C-f` | Next goal | `goal-navigation` | — | n/a (browser/editor-side navigation, not a distinct Agda command) |
| `C-c C-b` | Previous goal | `goal-navigation` | — | n/a (same as above) |
| `C-c C-t` | Goal type | `goal-type-and-compute` | `Test__GoalType.res` | — |
| `C-c C-e` | Context | `goal-details` | `Test__Context.res` | — |
| `C-c C-,` | Goal type and context | `goal-type-and-compute` | `Test__GoalTypeAndContext.res` | — |
| `C-c C-.` | Goal type, context, inferred type | `goal-details` | `Test__GoalTypeContextAndInferredType.res` | — |
| `C-c C-;` | Goal type, context, checked type | `goal-details` | `Test__GoalTypeContextAndCheckedType.res` | — |
| `C-c C-d` | Infer type | `goal-details` | `Test__InferType.res` | `InferIrrelevant` |
| `C-c C-n` | Compute normal form | `goal-type-and-compute` | `Test__ComputeNormalForm.res` | `ComputeUsingShowInstance`, `EvalInTopLevel` |
| `C-c C-z` | Search about | `query-shortcuts` | `Test__SearchAbout.res` | — |
| `C-c C-o` | Module contents | `query-shortcuts`, `module-contents-submodules` | `Test__ModuleContents.res` | — |
| `C-c C-w` | Why in scope | `query-shortcuts` | `Test__WhyInScope.res` | — |

Not bound to a shortcut in als-demo today (see "Known gaps" below), but
covered on the agda-mode-vscode side:

| Feature | agda-mode-vscode test | Status in als-demo |
| --- | --- | --- |
| Jump to definition | `Test__JumpToTarget.res` | Not implemented -- `definitionSite` is parsed but never acted on (ROADMAP.md). |
| Solve constraints (`Cmd_solveAll`/`Cmd_solveOne`) | `Test__SolveConstraints.res` | `SolveAll` is typed in `app.d.ts` but not wired to any shortcut. |
| Show goals (`AllGoalsWarnings`) | `Test__ShowGoals.res` | Rendered automatically after Load/edits, not behind its own shortcut -- no dedicated als-demo script isolates it. |

All commands now have als-demo browser test coverage. Every als-demo query
result in this table has also been directly compared against a live
`vscode-test-web` run of real `agda-mode-vscode` + ALS-WASM (not just the
statically-referenced `Test__*.res` assertions) -- see
`/home/jim/agda-scratchpad/agda-command-behavior-reference.md` for that
sweep's per-command notes.

## Browser Constraints

- Use CodeMirror `EditorView.dispatch()` for automated tests.
- Do not use `document.execCommand()` or direct `.cm-content` mutation; it can corrupt widgets and insert goal marker text into editable content.
- Run browser tests through `scripts/browser-test-*.sh` where possible.
