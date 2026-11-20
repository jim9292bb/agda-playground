import { getAgdaShortcutContext } from './shortcut-context'

/** @import { EditorView } from '@codemirror/view' */
/** @import { AgdaController } from '$lib/controller.svelte' */
/** @import { AgdaShortcutContext } from './shortcut-context' */

/**
 * @typedef {{id: number | string, range?: string, type?: string, context?: string}} GoalInfo
 */

/**
 * Side effects tied to how a command run ends. Neither is called when the
 * command is never sent at all (Agda not active, or waiting on the input
 * prompt -- the prompt carries the hooks and passes them to runAgdaCommand
 * itself once submitted).
 * @typedef {object} AgdaShortcutHooks
 * @prop {() => void} [onSuccess]
 *   Called once Agda has accepted the interaction, before "<label> finished."
 *   is logged. A throw here is reported to the console, never turned into a
 *   "<label> failed" (Agda already ran the command).
 * @prop {() => void} [onFailure]
 *   Called when building or running the interaction throws.
 */

/** @param {unknown} err */
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err)
}

/**
 * The one place that turns "build an interaction, send it to Agda" into the
 * log lines and hook calls every command path shares: the direct shortcut
 * paths below and both pages' input-prompt submit.
 * @param {{
 *   label: string,
 *   agdaController: AgdaController,
 *   appendLog: (text: string) => void,
 *   hooks?: AgdaShortcutHooks,
 *   build: () => string | void | Promise<string | void>,
 * }} opts
 */
export async function runAgdaCommand({ label, agdaController, appendLog, hooks = {}, build }) {
  try {
    appendLog(`${label}...\n`)
    const interaction = await build()
    if (interaction) await agdaController.runAgdaInteraction(interaction)
  } catch (err) {
    hooks.onFailure?.()
    appendLog(`${label} failed: ${errorMessage(err)}\n`)
    return
  }
  try {
    hooks.onSuccess?.()
  } catch (err) {
    console.error(`${label}: onSuccess hook failed`, err)
  }
  appendLog(`${label} finished.\n`)
}

/**
 * @param {{
 *   label: string,
 *   view: EditorView,
 *   agdaController: AgdaController,
 *   goalInfos: GoalInfo[],
 *   appendLog: (text: string) => void,
 *   hooks?: AgdaShortcutHooks,
 *   presync?: (view: EditorView) => Promise<void>,
 *   command: (context: AgdaShortcutContext) => string | Promise<void>,
 * }} opts
 */
export async function runAgdaShortcut(opts) {
  const { label, view, agdaController, goalInfos, appendLog, hooks, presync, command } = opts
  if (agdaController.alsWorkerStatus !== 'active') {
    appendLog(`${label} failed: Agda is not active.\n`)
    return
  }

  await runAgdaCommand({
    label, agdaController, appendLog, hooks,
    build: async () => {
      await (presync ? presync(view) : agdaController.syncSourceFileToDrive())
      const context = getAgdaShortcutContext(view, agdaController.currentFilePath, goalInfos, agdaController.receivedNumericAgdaVersion)
      return command(context)
    },
  })
}

/**
 * @param {{
 *   label: string,
 *   view: EditorView,
 *   agdaController: AgdaController,
 *   goalInfos: GoalInfo[],
 *   appendLog: (text: string) => void,
 *   hooks?: AgdaShortcutHooks,
 *   presync?: (view: EditorView) => Promise<void>,
 *   command: (context: AgdaShortcutContext, input: string) => string | Promise<void>,
 *   onNeedsInput: (
 *     label: string,
 *     view: EditorView,
 *     context: AgdaShortcutContext,
 *     command: (context: AgdaShortcutContext, input: string) => string | Promise<void>,
 *     hooks: AgdaShortcutHooks,
 *   ) => void,
 * }} opts
 */
export async function runAgdaShortcutWithInputPrompt(opts) {
  const { label, view, agdaController, goalInfos, appendLog, hooks = {}, presync, command, onNeedsInput } = opts
  if (agdaController.alsWorkerStatus !== 'active') {
    appendLog(`${label} failed: Agda is not active.\n`)
    return
  }

  /** @type {AgdaShortcutContext} */
  let context
  try {
    await (presync ? presync(view) : agdaController.syncSourceFileToDrive())
    context = getAgdaShortcutContext(view, agdaController.currentFilePath, goalInfos, agdaController.receivedNumericAgdaVersion)
  } catch (err) {
    hooks.onFailure?.()
    appendLog(`${label} failed: ${errorMessage(err)}\n`)
    return
  }

  if (!context.input.trim()) {
    onNeedsInput(label, view, context, command, hooks)
    return
  }

  await runAgdaCommand({
    label, agdaController, appendLog, hooks,
    build: () => command(context, context.input),
  })
}
