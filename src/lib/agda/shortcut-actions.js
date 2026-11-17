/**
 * What each Agda shortcut actually does: shortcut id -> which Agda command
 * to build (via commands.js), whether to prompt for input first, and which
 * pending-goal bookkeeping the matching response handler relies on.
 *
 * Shared by the main playground (src/routes/+page.svelte) and the notebook
 * routes (src/lib/components/NotebookPage.svelte). Everything that genuinely
 * differs between them -- which EditorView a command runs against, how Load
 * truncates/syncs, how goal navigation moves the cursor, where the
 * implicit/irrelevant display toggles live -- comes in through the `host`.
 */

import {
  autoOneCommand,
  computeCommand,
  computeToplevelCommand,
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
  moduleContentsCommand,
  moduleContentsToplevelCommand,
  refineCommand,
  searchAboutToplevelCommand,
  toggleImplicitArgsCommand,
  toggleIrrelevantArgsCommand,
  whyInScopeCommand,
  whyInScopeToplevelCommand,
} from './commands'

/** @import { AgdaShortcutContext } from './shortcut-context' */
/** @import { AgdaShortcutDefinition } from './shortcuts' */
/** @import { ALSMessageRouter } from './transport' */

/**
 * @typedef {(context: AgdaShortcutContext) => string | Promise<void>} AgdaShortcutCommand
 * @typedef {(context: AgdaShortcutContext, input: string) => string | Promise<void>} AgdaPromptedShortcutCommand
 */

/**
 * @typedef {object} AgdaShortcutHost
 * @prop {() => void} load
 * @prop {(direction: 1 | -1) => void} focusAdjacentGoal
 * @prop {(label: string, command: AgdaShortcutCommand) => void} run
 *   Runs `command` with the current shortcut context straight away.
 * @prop {(label: string, command: AgdaPromptedShortcutCommand) => void} runWithInputPrompt
 *   Runs `command` with the goal's own content as input, or prompts for
 *   input first when there is none.
 * @prop {() => ALSMessageRouter | undefined} getAlsRouter
 * @prop {() => void} toggleShowImplicitArgs
 *   Flips the host's own UI state mirroring Agda's display option.
 * @prop {() => void} toggleShowIrrelevantArgs
 */

/** @param {AgdaShortcutContext} context */
export function requireGoal(context) {
  if (!context.goal) throw new Error('Place the cursor inside a goal first.')
  return context.goal
}

/**
 * Undoes the pending-goal bookkeeping a failed command set up, so a later
 * unrelated response isn't applied to that goal.
 * @param {ALSMessageRouter | undefined} alsRouter
 * @param {string} label
 */
export function clearPendingAgdaGoal(alsRouter, label) {
  if (label === 'Case split' && alsRouter) {
    alsRouter.pendingCaseSplitGoal = undefined
  } else if ((label === 'Give' || label === 'Refine' || label === 'Auto' || label === 'Elaborate and give') && alsRouter) {
    alsRouter.pendingGiveGoal = undefined
  }
}

/**
 * @param {AgdaShortcutDefinition} shortcut
 * @param {AgdaShortcutHost} host
 */
export function dispatchAgdaShortcut(shortcut, host) {
  /** @param {NonNullable<AgdaShortcutContext['goal']>} goal */
  const setPendingGiveGoal = goal => {
    const router = host.getAlsRouter()
    if (router) router.pendingGiveGoal = goal
  }

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
      host.run(shortcut.label, context => goalTypeCommand('Simplified', requireGoal(context)))
      break
    case 'context':
      host.run(shortcut.label, context => contextCommand('Simplified', requireGoal(context)))
      break
    case 'goal-type-context':
      host.run(shortcut.label, context => goalTypeContextCommand('Simplified', requireGoal(context)))
      break
    case 'goal-type-context-infer':
      host.run(shortcut.label, context => {
        const goal = requireGoal(context)
        if (!context.input.trim()) {
          return goalTypeContextCommand('Simplified', goal)
        }
        return goalTypeContextInferCommand('Simplified', goal, context.input)
      })
      break
    case 'goal-type-context-check':
      host.runWithInputPrompt(shortcut.label, (context, input) =>
        goalTypeContextCheckCommand('Simplified', requireGoal(context), input))
      break
    case 'search-about':
      host.runWithInputPrompt(shortcut.label, (_context, input) =>
        searchAboutToplevelCommand('Simplified', input))
      break
    case 'module-contents':
      host.runWithInputPrompt(shortcut.label, (context, input) => {
        const goal = context.goal
        return goal
          ? moduleContentsCommand('Simplified', goal, input)
          : moduleContentsToplevelCommand('Simplified', input)
      })
      break
    case 'why-in-scope':
      host.runWithInputPrompt(shortcut.label, (context, input) => {
        const goal = context.goal
        return goal
          ? whyInScopeCommand(goal, input)
          : whyInScopeToplevelCommand(input)
      })
      break
    case 'give':
      host.runWithInputPrompt(shortcut.label, (context, input) => {
        const goal = requireGoal(context)
        setPendingGiveGoal(goal)
        return giveCommand(goal, context.range, input)
      })
      break
    case 'refine':
      // Unlike Give/Elaborate-give/Why-in-scope, Refine's own Agda command
      // (Cmd_refine_or_intro) has meaningful behavior for *empty* content --
      // it falls back to "intro" (auto-introduce a constructor), succeeding
      // outright when the goal type has exactly one constructor. Always
      // sending (never prompting first, unlike runWithInputPrompt) lets
      // Agda's own IntroNotFound/IntroConstructorUnknown responses surface
      // instead of a client-side prompt overriding that behavior.
      host.run(shortcut.label, context => {
        const goal = requireGoal(context)
        setPendingGiveGoal(goal)
        return refineCommand(goal, context.range, context.input)
      })
      break
    case 'auto':
      host.run(shortcut.label, context => {
        const goal = requireGoal(context)
        setPendingGiveGoal(goal)
        return autoOneCommand('AsIs', goal, context.range, context.input)
      })
      break
    case 'elaborate-give':
      host.runWithInputPrompt(shortcut.label, (context, input) => {
        const goal = requireGoal(context)
        setPendingGiveGoal(goal)
        return elaborateGiveCommand('Simplified', goal, input)
      })
      break
    case 'helper-function':
      host.runWithInputPrompt(shortcut.label, (context, input) =>
        helperFunctionCommand('AsIs', requireGoal(context), input))
      break
    case 'case-split':
      host.runWithInputPrompt(shortcut.label, (context, input) => {
        const goal = requireGoal(context)
        const router = host.getAlsRouter()
        if (router) router.pendingCaseSplitGoal = goal
        return makeCaseCommand(goal, context.range, input)
      })
      break
    case 'compute':
      host.runWithInputPrompt(shortcut.label, (context, input) => {
        const goal = context.goal
        return goal
          ? computeCommand('DefaultCompute', goal, input)
          : computeToplevelCommand('DefaultCompute', input)
      })
      break
    case 'infer':
      host.runWithInputPrompt(shortcut.label, (context, input) => {
        const goal = context.goal
        return goal
          ? inferCommand('Simplified', goal, input)
          : inferToplevelCommand('Simplified', input)
      })
      break
    case 'toggle-implicit-args':
      // Goal-independent: no content, no cursor-in-goal requirement --
      // `context` is unused, matching agda-mode-vscode's own scope (only
      // Toggle is exposed there, see commands.js's toggleImplicitArgsCommand).
      host.toggleShowImplicitArgs()
      host.run(shortcut.label, () => toggleImplicitArgsCommand())
      break
    case 'toggle-irrelevant-args':
      host.toggleShowIrrelevantArgs()
      host.run(shortcut.label, () => toggleIrrelevantArgsCommand())
      break
  }
}
