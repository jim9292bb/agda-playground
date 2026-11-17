/// <reference types="vitest/globals" />

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
import { clearPendingAgdaGoal, dispatchAgdaShortcut } from './shortcut-actions'
import { agdaShortcutRegistry } from './shortcuts'

const goal = { id: 3, from: 10, to: 17, text: '{! x !}' }
const inGoal = { goal, input: 'x', range: 'RANGE' }
const noGoal = { goal: null, input: '', range: 'noRange' }

function makeHost() {
  /** @type {any[][]} */
  const calls = []
  /** @type {any} */
  const router = { pendingGiveGoal: undefined, pendingCaseSplitGoal: undefined }
  /** @type {import('./shortcut-actions').AgdaShortcutHost} */
  const host = {
    load: () => calls.push(['load']),
    focusAdjacentGoal: direction => calls.push(['focus', direction]),
    run: (label, command) => calls.push(['run', label, command]),
    runWithInputPrompt: (label, command) => calls.push(['prompt', label, command]),
    getAlsRouter: () => router,
    toggleShowImplicitArgs: () => calls.push(['toggleImplicit']),
    toggleShowIrrelevantArgs: () => calls.push(['toggleIrrelevant']),
  }
  return { host, calls, router }
}

/** @param {string} id */
function dispatch(id) {
  const shortcut = agdaShortcutRegistry.find(s => s.id === id)
  if (!shortcut) throw new Error(`no shortcut ${id}`)
  const env = makeHost()
  dispatchAgdaShortcut(shortcut, env.host)
  const commandCall = env.calls.find(c => c[0] === 'run' || c[0] === 'prompt')
  return { ...env, kind: commandCall?.[0], label: commandCall?.[1], command: commandCall?.[2] }
}

describe('dispatchAgdaShortcut', () => {
  it('wires every registry shortcut to some host action (no silent no-op)', () => {
    for (const shortcut of agdaShortcutRegistry) {
      const { host, calls } = makeHost()
      dispatchAgdaShortcut(shortcut, host)
      expect(calls.length, shortcut.id).toBeGreaterThan(0)
    }
  })

  it('routes Load and goal navigation to the host', () => {
    expect(dispatch('load').calls).toEqual([['load']])
    expect(dispatch('next-goal').calls).toEqual([['focus', 1]])
    expect(dispatch('previous-goal').calls).toEqual([['focus', -1]])
  })

  it.each([
    ['goal-type', 'run', goalTypeCommand('Simplified', goal)],
    ['context', 'run', contextCommand('Simplified', goal)],
    ['goal-type-context', 'run', goalTypeContextCommand('Simplified', goal)],
    ['goal-type-context-check', 'prompt', goalTypeContextCheckCommand('Simplified', goal, 'x')],
    ['helper-function', 'prompt', helperFunctionCommand('AsIs', goal, 'x')],
    ['give', 'prompt', giveCommand(goal, 'RANGE', 'x')],
    ['elaborate-give', 'prompt', elaborateGiveCommand('Simplified', goal, 'x')],
    ['case-split', 'prompt', makeCaseCommand(goal, 'RANGE', 'x')],
    ['refine', 'run', refineCommand(goal, 'RANGE', 'x')],
    ['auto', 'run', autoOneCommand('AsIs', goal, 'RANGE', 'x')],
  ])('%s builds the goal-scoped command via %s', (id, kind, expected) => {
    const d = dispatch(id)
    expect(d.kind).toBe(kind)
    expect(d.label).toBe(agdaShortcutRegistry.find(s => s.id === id)?.label)
    expect(d.command(inGoal, 'x')).toBe(expected)
  })

  it.each([
    'goal-type', 'context', 'goal-type-context', 'goal-type-context-infer',
    'goal-type-context-check', 'helper-function', 'give', 'elaborate-give',
    'case-split', 'refine', 'auto',
  ])('%s refuses to run outside a goal', id => {
    expect(() => dispatch(id).command(noGoal, 'x')).toThrow('Place the cursor inside a goal first.')
  })

  it('Refine and Auto never prompt: empty content is meaningful to Agda', () => {
    expect(dispatch('refine').kind).toBe('run')
    expect(dispatch('auto').kind).toBe('run')
    expect(dispatch('refine').command({ ...inGoal, input: '' })).toBe(refineCommand(goal, 'RANGE', ''))
  })

  it('goal-type-context-infer drops to plain goal-type-context when the goal is empty', () => {
    const { command } = dispatch('goal-type-context-infer')
    expect(command({ ...inGoal, input: '  ' })).toBe(goalTypeContextCommand('Simplified', goal))
    expect(command(inGoal)).toBe(goalTypeContextInferCommand('Simplified', goal, 'x'))
  })

  it.each([
    ['compute', computeCommand('DefaultCompute', goal, 'e'), computeToplevelCommand('DefaultCompute', 'e')],
    ['infer', inferCommand('Simplified', goal, 'e'), inferToplevelCommand('Simplified', 'e')],
    ['module-contents', moduleContentsCommand('Simplified', goal, 'e'), moduleContentsToplevelCommand('Simplified', 'e')],
    ['why-in-scope', whyInScopeCommand(goal, 'e'), whyInScopeToplevelCommand('e')],
  ])('%s uses the goal when there is one, else falls back to its toplevel variant', (id, inGoalCmd, toplevelCmd) => {
    const { kind, command } = dispatch(id)
    expect(kind).toBe('prompt')
    expect(command(inGoal, 'e')).toBe(inGoalCmd)
    expect(command(noGoal, 'e')).toBe(toplevelCmd)
  })

  it('search-about is always toplevel', () => {
    const { command } = dispatch('search-about')
    expect(command(inGoal, 'e')).toBe(searchAboutToplevelCommand('Simplified', 'e'))
    expect(command(noGoal, 'e')).toBe(searchAboutToplevelCommand('Simplified', 'e'))
  })

  it.each(['give', 'refine', 'auto', 'elaborate-give'])(
    '%s records the goal as pendingGiveGoal for the GiveAction handler', id => {
      const d = dispatch(id)
      d.command(inGoal, 'x')
      expect(d.router.pendingGiveGoal).toBe(goal)
      expect(d.router.pendingCaseSplitGoal).toBeUndefined()
    })

  it('case-split records the goal as pendingCaseSplitGoal for the MakeCase handler', () => {
    const d = dispatch('case-split')
    d.command(inGoal, 'x')
    expect(d.router.pendingCaseSplitGoal).toBe(goal)
    expect(d.router.pendingGiveGoal).toBeUndefined()
  })

  it('toggles flip the host display state and send the toggle command', () => {
    const implicit = dispatch('toggle-implicit-args')
    expect(implicit.calls[0]).toEqual(['toggleImplicit'])
    expect(implicit.command(noGoal)).toBe(toggleImplicitArgsCommand())

    const irrelevant = dispatch('toggle-irrelevant-args')
    expect(irrelevant.calls[0]).toEqual(['toggleIrrelevant'])
    expect(irrelevant.command(noGoal)).toBe(toggleIrrelevantArgsCommand())
  })
})

describe('clearPendingAgdaGoal', () => {
  it('clears the bookkeeping a failed Give / Case split set up', () => {
    const router = /** @type {any} */ ({ pendingGiveGoal: goal, pendingCaseSplitGoal: goal })
    clearPendingAgdaGoal(router, 'Give')
    expect(router.pendingGiveGoal).toBeUndefined()
    expect(router.pendingCaseSplitGoal).toBe(goal)
    clearPendingAgdaGoal(router, 'Case split')
    expect(router.pendingCaseSplitGoal).toBeUndefined()
  })

  it('clears pendingGiveGoal for every shortcut that sets it', () => {
    for (const id of ['give', 'refine', 'auto', 'elaborate-give']) {
      const d = dispatch(id)
      d.command(inGoal, 'x')
      expect(d.router.pendingGiveGoal, id).toBe(goal)
      clearPendingAgdaGoal(d.router, d.label)
      expect(d.router.pendingGiveGoal, id).toBeUndefined()
    }
  })

  it('tolerates a missing router', () => {
    expect(() => clearPendingAgdaGoal(undefined, 'Give')).not.toThrow()
  })
})
