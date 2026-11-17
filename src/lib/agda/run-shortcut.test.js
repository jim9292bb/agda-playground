/// <reference types="vitest/globals" />

import { EditorState, EditorSelection } from '@codemirror/state'
import { offsetTracking } from '$lib/codemirror/offsets'
import { agdaGoalState } from './goal-state'
import { runAgdaShortcut, runAgdaShortcutWithInputPrompt } from './run-shortcut'

/** @param {string} doc @param {number} cursor */
function fakeView(doc, cursor) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [offsetTracking(), agdaGoalState],
  })
  // run-shortcut only reads `view.state` (via getAgdaShortcutContext).
  return /** @type {import('@codemirror/view').EditorView} */ (/** @type {unknown} */ ({ state }))
}

/**
 * @param {{ active?: boolean, interaction?: (s: string) => Promise<void> }} [opts]
 */
function makeEnv({ active = true, interaction = async () => {} } = {}) {
  /** @type {string[]} */
  const events = []
  const agdaController = /** @type {any} */ ({
    alsWorkerStatus: active ? 'active' : 'starting',
    currentFilePath: '/source.agda',
    receivedNumericAgdaVersion: '2.8.0',
    syncSourceFileToDrive: async () => {},
    /** @param {string} s */
    runAgdaInteraction: async s => {
      events.push(`interaction:${s}`)
      await interaction(s)
    },
  })
  const hooks = {
    onSuccess: () => events.push('onSuccess'),
    onFailure: () => events.push('onFailure'),
  }
  return {
    events,
    hooks,
    common: {
      label: 'Thing',
      view: fakeView('f = {! x !}', 6),
      agdaController,
      goalInfos: [{ id: 0 }],
      /** @param {string} msg */
      appendLog: msg => events.push(`log:${msg.trim()}`),
      hooks,
    },
  }
}

describe('runAgdaShortcut', () => {
  it('calls no hook when Agda is not active (nothing was sent)', async () => {
    const { events, common } = makeEnv({ active: false })
    await runAgdaShortcut({ ...common, command: () => 'CMD' })
    expect(events).toEqual(['log:Thing failed: Agda is not active.'])
  })

  it('calls onSuccess after the interaction, before logging "finished"', async () => {
    const { events, common } = makeEnv()
    await runAgdaShortcut({ ...common, command: () => 'CMD' })
    expect(events).toEqual(['log:Thing...', 'interaction:CMD', 'onSuccess', 'log:Thing finished.'])
  })

  it('calls only onFailure when building the command throws', async () => {
    const { events, common } = makeEnv()
    await runAgdaShortcut({ ...common, command: () => { throw new Error('nope') } })
    expect(events).toEqual(['log:Thing...', 'onFailure', 'log:Thing failed: nope'])
  })

  it('calls only onFailure when the interaction rejects', async () => {
    const { events, common } = makeEnv({ interaction: async () => { throw new Error('agda said no') } })
    await runAgdaShortcut({ ...common, command: () => 'CMD' })
    expect(events).toEqual(['log:Thing...', 'interaction:CMD', 'onFailure', 'log:Thing failed: agda said no'])
  })

  it('works without hooks', async () => {
    const { events, common } = makeEnv()
    await runAgdaShortcut({ ...common, hooks: undefined, command: () => 'CMD' })
    expect(events).toEqual(['log:Thing...', 'interaction:CMD', 'log:Thing finished.'])
  })
})

describe('runAgdaShortcutWithInputPrompt', () => {
  it('runs with the goal content and calls onSuccess', async () => {
    const { events, common } = makeEnv()
    const onNeedsInput = vi.fn()
    await runAgdaShortcutWithInputPrompt({ ...common, command: (_ctx, input) => `CMD ${input}`, onNeedsInput })
    expect(onNeedsInput).not.toHaveBeenCalled()
    expect(events).toEqual(['log:Thing...', 'interaction:CMD x', 'onSuccess', 'log:Thing finished.'])
  })

  it('hands the hooks to the prompt instead of calling them when the goal is empty', async () => {
    const { events, common, hooks } = makeEnv()
    const onNeedsInput = vi.fn()
    const command = () => 'CMD'
    await runAgdaShortcutWithInputPrompt({ ...common, view: fakeView('f = {!  !}', 6), command, onNeedsInput })
    expect(events).toEqual([])
    expect(onNeedsInput).toHaveBeenCalledWith('Thing', expect.anything(), expect.anything(), command, hooks)
  })

  it('calls only onFailure when the interaction rejects', async () => {
    const { events, common } = makeEnv({ interaction: async () => { throw new Error('bad') } })
    await runAgdaShortcutWithInputPrompt({ ...common, command: () => 'CMD', onNeedsInput: vi.fn() })
    expect(events).toEqual(['log:Thing...', 'interaction:CMD', 'onFailure', 'log:Thing failed: bad'])
  })

  it('calls no hook when Agda is not active', async () => {
    const { events, common } = makeEnv({ active: false })
    await runAgdaShortcutWithInputPrompt({ ...common, command: () => 'CMD', onNeedsInput: vi.fn() })
    expect(events).toEqual(['log:Thing failed: Agda is not active.'])
  })
})
