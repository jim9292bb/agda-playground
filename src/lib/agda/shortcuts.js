/**
 * Data-driven Agda shortcut registry.
 *
 * The registry owns shortcut identity and default bindings. UI code remains
 * responsible for executing commands because it has access to editor/controller
 * state.
 */

/**
 * @typedef AgdaShortcutBinding
 * @prop {'chord' | 'keymap'} kind
 * @prop {string} key
 * @prop {string} [code]
 * @prop {boolean} [ctrl]
 * @prop {string} label
 * @prop {ChordStep[]} [steps] - present on chord bindings produced by
 *   parseAgdaChordBinding (override input) or reservedChordSequences; a
 *   full, explicit key sequence with no implicit prefix. Default registry
 *   chord bindings omit this and rely on the flat key/ctrl fields instead,
 *   with an implicit leading "C-c" synthesized by chordStepsOf().
 */

/**
 * @typedef ChordStep
 * @prop {string} key
 * @prop {boolean} ctrl
 * @prop {string} [code]
 */

/**
 * @typedef AgdaShortcutDefinition
 * @prop {string} id
 * @prop {string} label
 * @prop {AgdaShortcutBinding[]} bindings
 */

/** @type {readonly AgdaShortcutDefinition[]} */
export const agdaShortcutRegistry = Object.freeze([
  {
    id: 'load',
    label: 'Load',
    bindings: [
      { kind: 'chord', key: 'l', ctrl: true, label: 'Ctrl-c Ctrl-l' },
      { kind: 'keymap', key: 'Mod-Enter', label: 'Cmd-Enter' },
    ],
  },
  {
    id: 'next-goal',
    label: 'Next goal',
    bindings: [{ kind: 'chord', key: 'f', ctrl: true, label: 'Ctrl-c Ctrl-f' }],
  },
  {
    id: 'previous-goal',
    label: 'Previous goal',
    bindings: [{ kind: 'chord', key: 'b', ctrl: true, label: 'Ctrl-c Ctrl-b' }],
  },
  {
    id: 'goal-type',
    label: 'Goal type',
    bindings: [{ kind: 'chord', key: 't', ctrl: true, label: 'Ctrl-c Ctrl-t' }],
  },
  {
    id: 'context',
    label: 'Context',
    bindings: [{ kind: 'chord', key: 'e', ctrl: true, label: 'Ctrl-c Ctrl-e' }],
  },
  {
    id: 'goal-type-context',
    label: 'Goal type and context',
    bindings: [{ kind: 'chord', key: ',', ctrl: true, label: 'Ctrl-c Ctrl-,' }],
  },
  {
    id: 'goal-type-context-infer',
    label: 'Goal type, context and inferred type',
    bindings: [{ kind: 'chord', key: '.', ctrl: true, label: 'Ctrl-c Ctrl-.' }],
  },
  {
    id: 'goal-type-context-check',
    label: 'Goal type, context and checked type',
    bindings: [{ kind: 'chord', key: ';', ctrl: true, label: 'Ctrl-c Ctrl-;' }],
  },
  {
    id: 'give',
    label: 'Give',
    bindings: [
      { kind: 'chord', key: ' ', code: 'Space', ctrl: true, label: 'Ctrl-c Ctrl-Space' },
      { kind: 'chord', key: ' ', code: 'Space', label: 'Ctrl-c Space' },
    ],
  },
  {
    id: 'refine',
    label: 'Refine',
    bindings: [{ kind: 'chord', key: 'r', ctrl: true, label: 'Ctrl-c Ctrl-r' }],
  },
  {
    id: 'auto',
    label: 'Auto',
    bindings: [{ kind: 'chord', key: 'a', ctrl: true, label: 'Ctrl-c Ctrl-a' }],
  },
  {
    id: 'elaborate-give',
    label: 'Elaborate and give',
    bindings: [{ kind: 'chord', key: 'm', ctrl: true, label: 'Ctrl-c Ctrl-m' }],
  },
  {
    id: 'helper-function',
    label: 'Helper function type',
    bindings: [{ kind: 'chord', key: 'h', ctrl: true, label: 'Ctrl-c Ctrl-h' }],
  },
  {
    id: 'case-split',
    label: 'Case split',
    bindings: [{ kind: 'chord', key: 'c', ctrl: true, label: 'Ctrl-c Ctrl-c' }],
  },
  {
    id: 'compute',
    label: 'Compute',
    bindings: [{ kind: 'chord', key: 'n', ctrl: true, label: 'Ctrl-c Ctrl-n' }],
  },
  {
    id: 'infer',
    label: 'Infer type',
    bindings: [{ kind: 'chord', key: 'd', ctrl: true, label: 'Ctrl-c Ctrl-d' }],
  },
  {
    id: 'search-about',
    label: 'Search about',
    bindings: [{ kind: 'chord', key: 'z', ctrl: true, label: 'Ctrl-c Ctrl-z' }],
  },
  {
    id: 'module-contents',
    label: 'Module contents',
    bindings: [{ kind: 'chord', key: 'o', ctrl: true, label: 'Ctrl-c Ctrl-o' }],
  },
  {
    id: 'why-in-scope',
    label: 'Why in scope',
    bindings: [{ kind: 'chord', key: 'w', ctrl: true, label: 'Ctrl-c Ctrl-w' }],
  },
  {
    id: 'toggle-implicit-args',
    label: 'Toggle implicit arguments',
    bindings: [{
      kind: 'chord',
      key: 'h',
      ctrl: true,
      label: 'Ctrl-c Ctrl-x Ctrl-h',
      steps: [{ key: 'c', ctrl: true }, { key: 'x', ctrl: true }, { key: 'h', ctrl: true }],
    }],
  },
  {
    id: 'toggle-irrelevant-args',
    label: 'Toggle irrelevant arguments',
    bindings: [{
      kind: 'chord',
      key: 'i',
      ctrl: true,
      label: 'Ctrl-c Ctrl-x Ctrl-i',
      steps: [{ key: 'c', ctrl: true }, { key: 'x', ctrl: true }, { key: 'i', ctrl: true }],
    }],
  },
])

/**
 * @param {string} key
 * @returns {string}
 */
export function displayKey(key) {
  if (key === ' ') return 'Space'
  return key.length === 1 ? key : key[0].toUpperCase() + key.slice(1)
}

/** Two fixed chord sequences that are hardcoded elsewhere in the app
 *  (Unicode lookup, ALS abort) rather than dispatched through the regular
 *  shortcut registry. Not user-overridable and not shown in Settings, but
 *  must still participate in conflict-checking and runtime chord matching
 *  so an override can't silently collide with them. */
export const reservedChordSequences = Object.freeze([
  // The original hand-rolled dispatcher never checked ctrlKey on this second
  // key (only on the leading C-x) — preserved here as ctrl:false so a bare
  // "=" still completes the chord, matching prior behavior.
  { id: '__unicode-lookup', steps: [{ key: 'x', ctrl: true }, { key: '=', ctrl: false }] },
  { id: '__abort', steps: [{ key: 'c', ctrl: true }, { key: 'x', ctrl: true }, { key: 'a', ctrl: true }] },
])

/**
 * Resolves any chord binding to its full ChordStep[] sequence. Default
 * registry literals are flat {key, ctrl, code?} and implicitly mean
 * "Ctrl-c then this key" (their leading Ctrl-c is synthesized here);
 * override/reserved bindings already carry an explicit, complete `steps`.
 *
 * @param {AgdaShortcutBinding} binding
 * @returns {ChordStep[]}
 */
export function chordStepsOf(binding) {
  if (binding.steps) return binding.steps
  const step = /** @type {ChordStep} */ ({ key: binding.key, ctrl: Boolean(binding.ctrl) })
  if (binding.code) step.code = binding.code
  return [{ key: 'c', ctrl: true }, step]
}

/**
 * Parses a chord override string against the grammar:
 *   "C-" <one key> ( <space>* "C-" <one key> )*
 * Every step requires an explicit "C-" prefix and is always ctrl:true —
 * unlike some default bindings (e.g. Give's bare Space variant), the
 * override grammar has no way to express a non-Ctrl step.
 *
 * @param {string} input
 * @returns {AgdaShortcutBinding | null}
 */
export function parseAgdaChordBinding(input) {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  const steps = []
  for (const token of tokens) {
    const match = /^(?:C-|Ctrl-)(.+)$/i.exec(token)
    if (!match) return null
    const rawKey = match[1]
    const keyName = rawKey.toLowerCase()
    const key = keyName === 'space' || keyName === 'spc' ? ' ' : rawKey
    if (key !== ' ' && key.length !== 1) return null
    const step = /** @type {ChordStep} */ ({ key, ctrl: true })
    if (key === ' ') step.code = 'Space'
    steps.push(step)
  }

  return {
    kind: 'chord',
    key: steps[steps.length - 1].key,
    ctrl: true,
    steps,
    label: steps.map(s => `Ctrl-${displayKey(s.key)}`).join(' '),
  }
}

/**
 * @param {Record<string, string>} overrides
 * @returns {AgdaShortcutDefinition[]}
 */
export function createAgdaShortcutRegistry(overrides = {}) {
  return agdaShortcutRegistry.map(shortcut => {
    const override = overrides[shortcut.id]
    const binding = typeof override === 'string' ? parseAgdaChordBinding(override) : null
    if (!binding) return shortcut

    return {
      ...shortcut,
      bindings: [
        binding,
        ...shortcut.bindings.filter(defaultBinding => defaultBinding.kind !== 'chord'),
      ],
    }
  })
}

/**
 * @param {ChordStep} step
 * @returns {string}
 */
function stepKey(step) {
  return `${step.ctrl ? 'ctrl+' : ''}${step.key.toLowerCase()}`
}

/**
 * @param {ChordStep[]} steps
 * @returns {string}
 */
function sequenceIdentity(steps) {
  return steps.map(stepKey).join(' ')
}

/**
 * @param {ChordStep[]} shorter
 * @param {ChordStep[]} longer
 * @returns {boolean}
 */
function isPrefixOf(shorter, longer) {
  if (shorter.length >= longer.length) return false
  return shorter.every((step, i) => stepKey(step) === stepKey(longer[i]))
}

/**
 * @param {Record<string, string>} overrides
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateAgdaShortcutOverrides(overrides) {
  const errors = []
  for (const [id, value] of Object.entries(overrides)) {
    if (!value.trim()) continue
    if (!parseAgdaChordBinding(value)) {
      errors.push(`${id}: use a chord such as Ctrl-c Ctrl-g, Ctrl-x Ctrl-s, or Ctrl-c Ctrl-x Ctrl-a.`)
    }
  }

  const entries = reservedChordSequences.map(r =>
    ({ id: r.id, label: sequenceIdentity(r.steps), steps: r.steps }))
  for (const shortcut of createAgdaShortcutRegistry(overrides)) {
    for (const binding of shortcut.bindings.filter(binding => binding.kind === 'chord')) {
      entries.push({ id: shortcut.id, label: binding.label, steps: chordStepsOf(binding) })
    }
  }

  const byIdentity = new Map()
  for (const entry of entries) {
    const identity = sequenceIdentity(entry.steps)
    const previous = byIdentity.get(identity)
    if (previous && previous.id !== entry.id) {
      errors.push(`${entry.label} is assigned to both ${previous.id} and ${entry.id}.`)
    } else {
      byIdentity.set(identity, entry)
    }
  }

  for (const a of entries) {
    for (const b of entries) {
      if (a.id === b.id) continue
      if (isPrefixOf(a.steps, b.steps)) {
        errors.push(`${a.label} (${a.id}) is a prefix of ${b.label} (${b.id}) and would be ambiguous.`)
      }
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

/** @param {KeyboardEvent} event */
function isSpaceEvent(event) {
  return event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space'
}

/**
 * @param {KeyboardEvent} event
 * @param {ChordStep} step
 */
function matchesStep(event, step) {
  if (event.altKey || event.metaKey) return false

  if (step.key === ' ') {
    return Boolean(step.ctrl) === event.ctrlKey && isSpaceEvent(event)
  }

  return Boolean(step.ctrl) === event.ctrlKey &&
    event.key.toLowerCase() === step.key.toLowerCase()
}

/**
 * Advances a chord attempt by one keydown against a merged sequence table.
 * The registry here is small (~20 sequences, at most a few steps deep), so
 * a linear scan per keystroke is simple and plenty fast — no trie needed.
 *
 * @param {ChordStep[]} progress steps already matched this chord attempt
 * @param {KeyboardEvent} event the newest keydown
 * @param {readonly {id: string, steps: ChordStep[]}[]} table merged reserved+registry sequences
 * @returns {{status: 'no-match'} | {status: 'partial', progress: ChordStep[]} | {status: 'complete', id: string, progress: ChordStep[]}}
 */
export function advanceAgdaChord(progress, event, table) {
  const stepIndex = progress.length
  const candidates = table.filter(entry =>
    entry.steps.length > stepIndex && matchesStep(event, entry.steps[stepIndex]))
  if (candidates.length === 0) return { status: 'no-match' }

  const nextProgress = [...progress, candidates[0].steps[stepIndex]]
  const exact = candidates.find(entry => entry.steps.length === nextProgress.length)
  if (exact && candidates.every(entry => entry.steps.length === nextProgress.length || entry === exact)) {
    return { status: 'complete', id: exact.id, progress: nextProgress }
  }
  return { status: 'partial', progress: nextProgress }
}

/**
 * @param {string} id
 * @param {readonly AgdaShortcutDefinition[]} registry
 * @returns {AgdaShortcutDefinition | undefined}
 */
export function findAgdaShortcutById(id, registry) {
  return registry.find(shortcut => shortcut.id === id)
}

/**
 * @param {AgdaShortcutDefinition} shortcut
 * @returns {string}
 */
export function formatAgdaShortcutHelpBinding(shortcut) {
  const binding = shortcut.bindings.find(b => b.kind === 'chord') ?? shortcut.bindings[0]
  return binding.label.replace(/\bCtrl-/g, 'C-').replace(/\bSpace\b/g, 'SPC')
}
