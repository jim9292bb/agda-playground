/**
 * What each Agda shortcut actually does: shortcut id -> which Agda command
 * to build (via commands.js), whether to prompt for input first, and which
 * pending-goal bookkeeping the matching response handler relies on.
 *
 * Shared by the main playground (src/routes/+page.svelte) and the notebook
 * routes (src/lib/components/NotebookPage.svelte). Everything that genuinely
 * differs between them -- which EditorView a command runs against, how Load
 * truncates/syncs, how goal navigation moves the cursor -- comes in
 * through the `host`.
 */

import {
  autoOneCommand,
  computeCommand,
  computeToplevelCommand,
  constraintsCommand,
  contextCommand,
  elaborateGiveCommand,
  giveCommand,
  goalTypeCommand,
  goalTypeContextCheckCommand,
  goalTypeContextCommand,
  goalTypeContextInferCommand,
  helperFunctionCommand,
  inferCommand,
  inferToplevelCommand,
  makeCaseCommand,
  metasCommand,
  moduleContentsCommand,
  moduleContentsToplevelCommand,
  refineCommand,
  searchAboutToplevelCommand,
  solveAllCommand,
  solveOneCommand,
  toggleImplicitArgsCommand,
  toggleIrrelevantArgsCommand,
  whyInScopeCommand,
  whyInScopeToplevelCommand,
} from './commands'

/** @import { AgdaShortcutContext } from './shortcut-context' */
/** @import { AgdaShortcutDefinition } from './shortcuts' */
/** @import { ALSMessageRouter } from './transport' */
/** @import { AgdaShortcutHooks } from './run-shortcut' */

/**
 * @typedef {(context: AgdaShortcutContext) => string | Promise<void>} AgdaShortcutCommand
 * @typedef {(context: AgdaShortcutContext, input: string) => string | Promise<void>} AgdaPromptedShortcutCommand
 */

/**
 * @typedef {object} AgdaShortcutHost
 * @prop {() => void} load
 * @prop {(direction: 1 | -1) => void} focusAdjacentGoal
 * @prop {(label: string, command: AgdaShortcutCommand, hooks?: AgdaShortcutHooks) => void} run
 *   Runs `command` with the current shortcut context straight away, calling
 *   `hooks.onSuccess` / `hooks.onFailure` depending on how it ends.
 * @prop {(label: string, command: AgdaPromptedShortcutCommand, hooks?: AgdaShortcutHooks) => void} runWithInputPrompt
 *   Runs `command` with the goal's own content as input, or prompts for
 *   input first when there is none (the prompt then owns `hooks`).
 * @prop {() => ALSMessageRouter | undefined} getAlsRouter
 */

/** @typedef {import('./commands').Normalization} Normalization */
/** @typedef {import('./commands').ComputeMode} ComputeMode */

/** How many `C-u` presses a prefix can carry; extra presses are ignored. */
export const MAX_PREFIX_COUNT = 3

// `C-u` prefix count -> normalization, mirroring agda-mode-vscode's own
// keybindings (package.json): most query commands default to Simplified,
// while Auto and Helper function default to AsIs and so reach Simplified on
// the first `C-u` instead of Instantiated. Solve constraints and Show goals
// follow the AsIs family too; Show constraints takes no normalization at all before Agda
// 2.9 (see commands.js's constraintsCommand), so its prefix is ignored.
/** @type {readonly Normalization[]} */
const SIMPLIFIED_FAMILY = ['Simplified', 'Instantiated', 'Normalised', 'HeadNormal']
/** @type {readonly Normalization[]} */
const AS_IS_FAMILY = ['AsIs', 'Simplified', 'Normalised', 'HeadNormal']
// agda-mode-vscode binds only two `C-u` levels for Compute; a third press
// keeps the second.
/** @type {readonly ComputeMode[]} */
const COMPUTE_MODES = ['DefaultCompute', 'IgnoreAbstract', 'UseShowInstance']

const simplifiedFamilyIds = new Set([
  'goal-type', 'context', 'goal-type-context', 'goal-type-context-infer',
  'goal-type-context-check', 'search-about', 'module-contents',
  'elaborate-give', 'infer',
])
const asIsFamilyIds = new Set(['auto', 'helper-function', 'solve-constraints', 'show-goals'])

/** @param {number} prefixCount */
function clampPrefix(prefixCount) {
  return Math.max(0, Math.min(MAX_PREFIX_COUNT, Math.trunc(prefixCount) || 0))
}

/**
 * The normalization a shortcut uses after `prefixCount` `C-u` presses, or
 * null when the shortcut takes no normalization (the prefix is ignored).
 * @param {string} shortcutId
 * @param {number} prefixCount
 * @returns {Normalization | null}
 */
export function normalizationForPrefix(shortcutId, prefixCount) {
  const level = clampPrefix(prefixCount)
  if (simplifiedFamilyIds.has(shortcutId)) return SIMPLIFIED_FAMILY[level]
  if (asIsFamilyIds.has(shortcutId)) return AS_IS_FAMILY[level]
  return null
}

/**
 * Compute's mode after `prefixCount` `C-u` presses.
 * @param {number} prefixCount
 * @returns {ComputeMode}
 */
export function computeModeForPrefix(prefixCount) {
  return COMPUTE_MODES[Math.min(clampPrefix(prefixCount), COMPUTE_MODES.length - 1)]
}

/**
 * The log label for a run: unchanged without a prefix, so default runs log
 * exactly as before; with one, the chosen variant is appended
 * (e.g. "Goal type [Normalised]"), as agda-mode-vscode names its variants.
 * @param {AgdaShortcutDefinition} shortcut
 * @param {number} prefixCount
 */
function labelForPrefix(shortcut, prefixCount) {
  if (clampPrefix(prefixCount) === 0) return shortcut.label
  const variant = shortcut.id === 'compute'
    ? computeModeForPrefix(prefixCount)
    : normalizationForPrefix(shortcut.id, prefixCount)
  return variant ? `${shortcut.label} [${variant}]` : shortcut.label
}

/** @param {AgdaShortcutContext} context */
export function requireGoal(context) {
  if (!context.goal) throw new Error('Place the cursor inside a goal first.')
  return context.goal
}

/**
 * Pending-goal bookkeeping for one command run: `set` records the goal the
 * matching GiveAction/MakeCase response should fall back to, and
 * `hooks.onFailure` undoes it -- but only if the router still holds *this*
 * run's goal. A command that fails before setting anything (cursor outside a
 * goal) or after a later command overwrote the field must not wipe a
 * still-in-flight command's pending goal.
 * @param {AgdaShortcutHost} host
 * @param {'pendingGiveGoal' | 'pendingCaseSplitGoal'} field
 */
function pendingGoalBookkeeping(host, field) {
  /** @type {NonNullable<AgdaShortcutContext['goal']> | undefined} */
  let ownGoal
  return {
    /** @param {NonNullable<AgdaShortcutContext['goal']>} goal */
    set(goal) {
      ownGoal = goal
      const router = host.getAlsRouter()
      if (router) router[field] = goal
    },
    /** @type {AgdaShortcutHooks} */
    hooks: {
      onFailure() {
        const router = host.getAlsRouter()
        if (router && ownGoal && router[field] === ownGoal) router[field] = undefined
      },
    },
  }
}

/**
 * @param {AgdaShortcutDefinition} shortcut
 * @param {AgdaShortcutHost} host
 * @param {number} [prefixCount] how many `C-u` presses preceded the
 *   shortcut; selects the normalization (or Compute mode) variant, and is
 *   ignored by shortcuts that have none.
 */
export function dispatchAgdaShortcut(shortcut, host, prefixCount = 0) {
  const label = labelForPrefix(shortcut, prefixCount)
  const norm = normalizationForPrefix(shortcut.id, prefixCount) ?? 'Simplified'
  const pendingGive = pendingGoalBookkeeping(host, 'pendingGiveGoal')
  const pendingCaseSplit = pendingGoalBookkeeping(host, 'pendingCaseSplitGoal')

  switch (shortcut.id) {
    case 'load':
      host.load()
      break
    case 'next-goal':
      host.focusAdjacentGoal(1)
      break
    case 'previous-goal':
      host.focusAdjacentGoal(-1)
      break
    case 'goal-type':
      host.run(label, context => goalTypeCommand(norm, requireGoal(context)))
      break
    case 'context':
      host.run(label, context => contextCommand(norm, requireGoal(context)))
      break
    case 'goal-type-context':
      host.run(label, context => goalTypeContextCommand(norm, requireGoal(context)))
      break
    case 'goal-type-context-infer':
      host.run(label, context => {
        const goal = requireGoal(context)
        if (!context.input.trim()) {
          return goalTypeContextCommand(norm, goal)
        }
        return goalTypeContextInferCommand(norm, goal, context.input)
      })
      break
    case 'goal-type-context-check':
      host.runWithInputPrompt(label, (context, input) =>
        goalTypeContextCheckCommand(norm, requireGoal(context), input))
      break
    case 'search-about':
      host.runWithInputPrompt(label, (_context, input) =>
        searchAboutToplevelCommand(norm, input))
      break
    case 'module-contents':
      host.runWithInputPrompt(label, (context, input) => {
        const goal = context.goal
        return goal
          ? moduleContentsCommand(norm, goal, input)
          : moduleContentsToplevelCommand(norm, input)
      })
      break
    case 'why-in-scope':
      host.runWithInputPrompt(label, (context, input) => {
        const goal = context.goal
        return goal
          ? whyInScopeCommand(goal, input)
          : whyInScopeToplevelCommand(input)
      })
      break
    case 'give':
      host.runWithInputPrompt(label, (context, input) => {
        const goal = requireGoal(context)
        pendingGive.set(goal)
        return giveCommand(goal, context.range, input)
      }, pendingGive.hooks)
      break
    case 'refine':
      // Unlike Give/Elaborate-give/Why-in-scope, Refine's own Agda command
      // (Cmd_refine_or_intro) has meaningful behavior for *empty* content --
      // it falls back to "intro" (auto-introduce a constructor), succeeding
      // outright when the goal type has exactly one constructor. Always
      // sending (never prompting first, unlike runWithInputPrompt) lets
      // Agda's own IntroNotFound/IntroConstructorUnknown responses surface
      // instead of a client-side prompt overriding that behavior.
      host.run(label, context => {
        const goal = requireGoal(context)
        pendingGive.set(goal)
        return refineCommand(goal, context.range, context.input)
      }, pendingGive.hooks)
      break
    case 'auto':
      host.run(label, context => {
        const goal = requireGoal(context)
        pendingGive.set(goal)
        return autoOneCommand(norm, goal, context.range, context.input)
      }, pendingGive.hooks)
      break
    case 'elaborate-give':
      host.runWithInputPrompt(label, (context, input) => {
        const goal = requireGoal(context)
        pendingGive.set(goal)
        return elaborateGiveCommand(norm, goal, input)
      }, pendingGive.hooks)
      break
    case 'helper-function':
      host.runWithInputPrompt(label, (context, input) =>
        helperFunctionCommand(norm, requireGoal(context), input))
      break
    case 'case-split':
      host.runWithInputPrompt(label, (context, input) => {
        const goal = requireGoal(context)
        pendingCaseSplit.set(goal)
        return makeCaseCommand(goal, context.range, input)
      }, pendingCaseSplit.hooks)
      break
    case 'compute':
      host.runWithInputPrompt(label, (context, input) => {
        const goal = context.goal
        return goal
          ? computeCommand(computeModeForPrefix(prefixCount), goal, input)
          : computeToplevelCommand(computeModeForPrefix(prefixCount), input)
      })
      break
    case 'infer':
      host.runWithInputPrompt(label, (context, input) => {
        const goal = context.goal
        return goal
          ? inferCommand(norm, goal, input)
          : inferToplevelCommand(norm, input)
      })
      break
    case 'show-constraints':
      // File-level, like Show goals below: no goal or input needed.
      host.run(label, () => constraintsCommand())
      break
    case 'solve-constraints':
      // The goal under the cursor only, else every goal -- as in
      // agda-mode-vscode. The controller gives the solutions Agda sends
      // back (AgdaController.runAgdaInteraction).
      host.run(label, context => context.goal
        ? solveOneCommand(norm, context.goal)
        : solveAllCommand(norm))
      break
    case 'show-goals':
      host.run(label, () => metasCommand(norm))
      break
    case 'toggle-implicit-args':
      // Goal-independent: no content, no cursor-in-goal requirement --
      // `context` is unused, matching agda-mode-vscode's own scope (only
      // Toggle is exposed there, see commands.js's toggleImplicitArgsCommand).
      // The UI's checkbox state isn't flipped here: Agda answers with a
      // Status response carrying its actual setting, which the controller
      // mirrors (AgdaController.showImplicitArgs).
      host.run(label, () => toggleImplicitArgsCommand())
      break
    case 'toggle-irrelevant-args':
      host.run(label, () => toggleIrrelevantArgsCommand())
      break
  }
}
