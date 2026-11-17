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
 * prompt -- the prompt carries the hooks and calls them itself).
 * @typedef {object} AgdaShortcutHooks
 * @prop {() => void} [onSuccess]
 *   Called once Agda has accepted the interaction, before "<label> finished."
 *   is logged.
 * @prop {() => void} [onFailure]
 *   Called when building or running the interaction throws.
 */

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
export function runAgdaShortcut(opts) {
  const { label, view, agdaController, goalInfos, appendLog, hooks = {}, presync, command } = opts
  return (async () => {
    if (agdaController.alsWorkerStatus !== 'active') {
      appendLog(`${label} failed: Agda is not active.\n`)
      return
    }

    try {
      appendLog(`${label}...\n`)
      await (presync ? presync(view) : agdaController.syncSourceFileToDrive())
      const context = getAgdaShortcutContext(view, agdaController.currentFilePath, goalInfos, agdaController.receivedNumericAgdaVersion)
      const interaction = await command(context)
      if (interaction) await agdaController.runAgdaInteraction(interaction)
      hooks.onSuccess?.()
      appendLog(`${label} finished.\n`)
    } catch (err) {
      hooks.onFailure?.()
      appendLog(`${label} failed: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  })()
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
export function runAgdaShortcutWithInputPrompt(opts) {
  const { label, view, agdaController, goalInfos, appendLog, hooks = {}, presync, command, onNeedsInput } = opts
  return (async () => {
    if (agdaController.alsWorkerStatus !== 'active') {
      appendLog(`${label} failed: Agda is not active.\n`)
      return
    }

    try {
      await (presync ? presync(view) : agdaController.syncSourceFileToDrive())
      const context = getAgdaShortcutContext(view, agdaController.currentFilePath, goalInfos, agdaController.receivedNumericAgdaVersion)
      if (!context.input.trim()) {
        onNeedsInput(label, view, context, command, hooks)
        return
      }

      appendLog(`${label}...\n`)
      const interaction = await command(context, context.input)
      if (interaction) await agdaController.runAgdaInteraction(interaction)
      hooks.onSuccess?.()
      appendLog(`${label} finished.\n`)
    } catch (err) {
      hooks.onFailure?.()
      appendLog(`${label} failed: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  })()
}
