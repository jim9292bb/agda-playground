import { getAgdaShortcutContext } from './shortcut-context'

/** @import { EditorView } from '@codemirror/view' */
/** @import { AgdaController } from '$lib/controller.svelte' */
/** @import { AgdaShortcutContext } from './shortcut-context' */

/**
 * @typedef {{id: number | string, range?: string, type?: string, context?: string}} GoalInfo
 */

/**
 * @param {{
 *   label: string,
 *   view: EditorView,
 *   agdaController: AgdaController,
 *   goalInfos: GoalInfo[],
 *   appendLog: (text: string) => void,
 *   clearPendingGoal: (label: string) => void,
 *   presync?: (view: EditorView) => Promise<void>,
 *   command: (context: AgdaShortcutContext) => string | Promise<void>,
 * }} opts
 */
export function runAgdaShortcut(opts) {
  const { label, view, agdaController, goalInfos, appendLog, clearPendingGoal, presync, command } = opts
  void (async () => {
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
      appendLog(`${label} finished.\n`)
    } catch (err) {
      clearPendingGoal(label)
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
 *   clearPendingGoal: (label: string) => void,
 *   presync?: (view: EditorView) => Promise<void>,
 *   command: (context: AgdaShortcutContext, input: string) => string | Promise<void>,
 *   onNeedsInput: (
 *     label: string,
 *     view: EditorView,
 *     context: AgdaShortcutContext,
 *     command: (context: AgdaShortcutContext, input: string) => string | Promise<void>,
 *   ) => void,
 * }} opts
 */
export function runAgdaShortcutWithInputPrompt(opts) {
  const { label, view, agdaController, goalInfos, appendLog, clearPendingGoal, presync, command, onNeedsInput } = opts
  void (async () => {
    if (agdaController.alsWorkerStatus !== 'active') {
      appendLog(`${label} failed: Agda is not active.\n`)
      return
    }

    try {
      await (presync ? presync(view) : agdaController.syncSourceFileToDrive())
      const context = getAgdaShortcutContext(view, agdaController.currentFilePath, goalInfos, agdaController.receivedNumericAgdaVersion)
      if (!context.input.trim()) {
        onNeedsInput(label, view, context, command)
        return
      }

      appendLog(`${label}...\n`)
      const interaction = await command(context, context.input)
      if (interaction) await agdaController.runAgdaInteraction(interaction)
      appendLog(`${label} finished.\n`)
    } catch (err) {
      clearPendingGoal(label)
      appendLog(`${label} failed: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  })()
}
