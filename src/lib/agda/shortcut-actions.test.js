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
import { computeModeForPrefix, dispatchAgdaShortcut, normalizationForPrefix } from './shortcut-actions'
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
    run: (label, command, hooks) => calls.push(['run', label, command, hooks]),
    runWithInputPrompt: (label, command, hooks) => calls.push(['prompt', label, command, hooks]),
    getAlsRouter: () => router,
  }
  return { host, calls, router }
}

/**
 * @param {string} id
 * @param {number} [prefixCount]
 */
function dispatch(id, prefixCount) {
  const shortcut = agdaShortcutRegistry.find(s => s.id === id)
  if (!shortcut) throw new Error(`no shortcut ${id}`)
  const env = makeHost()
  dispatchAgdaShortcut(shortcut, env.host, prefixCount)
  const commandCall = env.calls.find(c => c[0] === 'run' || c[0] === 'prompt')
  return {
    ...env,
    kind: commandCall?.[0],
    label: commandCall?.[1],
    command: commandCall?.[2],
    /** @type {import('./run-shortcut').AgdaShortcutHooks} */
    hooks: commandCall?.[3] ?? {},
  }
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

  it.each([
    ['toggle-implicit-args', toggleImplicitArgsCommand()],
    ['toggle-irrelevant-args', toggleIrrelevantArgsCommand()],
  ])('%s only sends the toggle (display state comes from Agda\'s Status reply)', (id, expected) => {
    const d = dispatch(id)
    expect(d.kind).toBe('run')
    expect(d.command(noGoal)).toBe(expected)
    expect(d.hooks).toEqual({})
  })
})

describe('pending-goal cleanup hooks', () => {
  it.each(['give', 'refine', 'auto', 'elaborate-give'])(
    '%s clears pendingGiveGoal on failure, not on success', id => {
      const d = dispatch(id)
      d.command(inGoal, 'x')
      d.router.pendingCaseSplitGoal = goal
      d.hooks.onSuccess?.()
      expect(d.router.pendingGiveGoal).toBe(goal)
      d.hooks.onFailure?.()
      expect(d.router.pendingGiveGoal).toBeUndefined()
      expect(d.router.pendingCaseSplitGoal).toBe(goal)
    })

  it('case-split clears pendingCaseSplitGoal on failure, not on success', () => {
    const d = dispatch('case-split')
    d.command(inGoal, 'x')
    d.router.pendingGiveGoal = goal
    d.hooks.onSuccess?.()
    expect(d.router.pendingCaseSplitGoal).toBe(goal)
    d.hooks.onFailure?.()
    expect(d.router.pendingCaseSplitGoal).toBeUndefined()
    expect(d.router.pendingGiveGoal).toBe(goal)
  })

  it('every shortcut that sets a pending goal also passes an onFailure that clears it', () => {
    for (const shortcut of agdaShortcutRegistry) {
      const d = dispatch(shortcut.id)
      if (!d.command) continue
      try { d.command(inGoal, 'x') } catch { /* toplevel-only commands are fine */ }
      const pending = d.router.pendingGiveGoal ?? d.router.pendingCaseSplitGoal
      if (!pending) continue
      expect(d.hooks.onFailure, shortcut.id).toBeTypeOf('function')
      d.hooks.onFailure?.()
      expect(d.router.pendingGiveGoal ?? d.router.pendingCaseSplitGoal, shortcut.id).toBeUndefined()
    }
  })

  it('a failure before setting a goal leaves an in-flight command\'s pending goal alone', () => {
    const give = dispatch('give')
    give.command(inGoal, 'x')
    expect(give.router.pendingGiveGoal).toBe(goal)

    // A second Auto with the cursor outside any goal throws in requireGoal
    // before setting anything -- its onFailure must not clear Give's goal.
    const auto = dispatch('auto')
    auto.host.getAlsRouter = () => give.router
    expect(() => auto.command(noGoal)).toThrow()
    auto.hooks.onFailure?.()
    expect(give.router.pendingGiveGoal).toBe(goal)
  })

  it('a failure after a later command overwrote the field leaves the newer goal alone', () => {
    const first = dispatch('give')
    first.command(inGoal, 'x')
    const second = dispatch('refine')
    second.host.getAlsRouter = () => first.router
    const otherGoal = { ...goal, id: 4 }
    second.command({ ...inGoal, goal: otherGoal })
    expect(first.router.pendingGiveGoal).toBe(otherGoal)

    first.hooks.onFailure?.()
    expect(first.router.pendingGiveGoal).toBe(otherGoal)
    second.hooks.onFailure?.()
    expect(first.router.pendingGiveGoal).toBeUndefined()
  })

  it('tolerates a missing router', () => {
    const shortcut = agdaShortcutRegistry.find(s => s.id === 'give')
    if (!shortcut) throw new Error('no give shortcut')
    const { host, calls } = makeHost()
    host.getAlsRouter = () => undefined
    dispatchAgdaShortcut(shortcut, host)
    expect(() => calls[0][3].onFailure()).not.toThrow()
  })
})

describe('C-u normalization prefix', () => {
  const simplifiedFamily = ['goal-type', 'context', 'goal-type-context', 'goal-type-context-infer',
    'goal-type-context-check', 'search-about', 'module-contents', 'elaborate-give', 'infer']

  it('maps prefix counts like agda-mode-vscode (Simplified-default commands)', () => {
    for (const id of simplifiedFamily) {
      expect([0, 1, 2, 3].map(n => normalizationForPrefix(id, n)), id)
        .toEqual(['Simplified', 'Instantiated', 'Normalised', 'HeadNormal'])
    }
  })

  it('maps prefix counts like agda-mode-vscode (AsIs-default commands)', () => {
    for (const id of ['auto', 'helper-function']) {
      expect([0, 1, 2, 3].map(n => normalizationForPrefix(id, n)), id)
        .toEqual(['AsIs', 'Simplified', 'Normalised', 'HeadNormal'])
    }
  })

  it('maps Compute modes, keeping the last mode for a third C-u', () => {
    expect([0, 1, 2, 3].map(computeModeForPrefix))
      .toEqual(['DefaultCompute', 'IgnoreAbstract', 'UseShowInstance', 'UseShowInstance'])
  })

  it('clamps out-of-range counts', () => {
    expect(normalizationForPrefix('goal-type', 7)).toBe('HeadNormal')
    expect(normalizationForPrefix('goal-type', -1)).toBe('Simplified')
  })

  it('reports no normalization for commands that take none', () => {
    for (const id of ['load', 'give', 'refine', 'case-split', 'why-in-scope', 'compute', 'toggle-implicit-args']) {
      expect(normalizationForPrefix(id, 2), id).toBeNull()
    }
  })

  it('sends the selected normalization and names it in the label', () => {
    const goalType = dispatch('goal-type', 2)
    expect(goalType.label).toBe('Goal type [Normalised]')
    expect(goalType.command(inGoal)).toBe(goalTypeCommand('Normalised', goal))

    const infer = dispatch('infer', 1)
    expect(infer.label).toBe('Infer type [Instantiated]')
    expect(infer.command(noGoal, 'x')).toBe(inferToplevelCommand('Instantiated', 'x'))

    const auto = dispatch('auto', 1)
    expect(auto.label).toBe('Auto [Simplified]')
    expect(auto.command(inGoal)).toBe(autoOneCommand('Simplified', goal, 'RANGE', 'x'))

    const helper = dispatch('helper-function', 3)
    expect(helper.command(inGoal, 'x')).toBe(helperFunctionCommand('HeadNormal', goal, 'x'))

    const compute = dispatch('compute', 1)
    expect(compute.label).toBe('Compute [IgnoreAbstract]')
    expect(compute.command(noGoal, 'x')).toBe(computeToplevelCommand('IgnoreAbstract', 'x'))
  })

  it('leaves labels and commands unchanged without a prefix', () => {
    for (const shortcut of agdaShortcutRegistry) {
      const unprefixed = dispatch(shortcut.id)
      const zero = dispatch(shortcut.id, 0)
      expect(zero.label, shortcut.id).toBe(unprefixed.label)
      expect(unprefixed.label ?? shortcut.label, shortcut.id).toBe(shortcut.label)
    }
    expect(dispatch('goal-type').command(inGoal)).toBe(goalTypeCommand('Simplified', goal))
    expect(dispatch('auto').command(inGoal)).toBe(autoOneCommand('AsIs', goal, 'RANGE', 'x'))
  })

  it('ignores the prefix for commands without variants', () => {
    const give = dispatch('give', 2)
    expect(give.label).toBe(dispatch('give').label)
    expect(give.command(inGoal, 'x')).toBe(giveCommand(goal, 'RANGE', 'x'))
  })
})
