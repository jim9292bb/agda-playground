/**
 * Text rendering of Agda's `Constraints` DisplayInfo (the answer to
 * `Cmd_constraints`), matching what Agda's own Emacs mode prints in its
 * *Constraints* buffer -- e.g.
 *
 *     ?0 := z
 *     g _17 = z : N (blocked on _17, belongs to problem 27)
 *
 * The JSON carries each constraint structurally (JSONTop.hs's `encodeOC`),
 * with its terms already pretty-printed to strings, so this only reassembles
 * them the way `Pretty (OutputConstraint a b)` and `Pretty (OutputForm a b)`
 * (Agda.Interaction.BasicOps) and `Pretty Blocker`
 * (Agda.Syntax.Internal.Blockers) lay them out, one constraint per line.
 */

/**
 * @typedef {{ start: { line: number, col: number }, end: { line: number, col: number } }} ConstraintInterval
 * @typedef {{ kind: string, [field: string]: any }} AgdaBlocker
 * @typedef {{ kind: string, [field: string]: any }} AgdaOutputConstraint
 * @typedef AgdaOutputForm
 * @prop {ConstraintInterval[]} [range]
 * @prop {number[]} [problems]
 * @prop {AgdaBlocker} [unblocker]
 * @prop {AgdaOutputConstraint} constraint
 */

/** `Comparison`'s own Pretty instance; JSON sends the constructor name. */
const COMPARISONS = /** @type {Record<string, string>} */ ({ CmpEq: '=', CmpLeq: '=<' })

/** `Polarity`'s Pretty instance (Agda.TypeChecking.Monad.Base). */
const POLARITIES = /** @type {Record<string, string>} */ ({
  Covariant: '+', Contravariant: '-', Invariant: '*', Nonvariant: '_',
})

/** @param {string} comparison */
function comparisonSymbol(comparison) {
  return COMPARISONS[comparison] ?? comparison
}

/** @param {unknown} term */
function text(term) {
  return typeof term === 'string' ? term : JSON.stringify(term)
}

/** Agda's `bin val ":" ty`. @param {string} value @param {unknown} type */
function ofType(value, type) {
  return `${value} : ${text(type)}`
}

/** Agda's `pcmp cmp a b`. @param {string} symbol @param {unknown[]} [objects] */
function compare(symbol, objects) {
  const [left, right] = objects ?? []
  return `${text(left)} ${symbol} ${text(right)}`
}

/**
 * Agda parenthesizes a postponed argument only when its text has a space
 * or a line break (BasicOps.hs's `mparens (any (`elem` [' ', '\n']) ...)`).
 * @param {string} term
 */
function argument(term) {
  return /[ \n]/.test(term) ? `(${term})` : term
}

/** @param {AgdaOutputConstraint} c @returns {string} */
export function formatOutputConstraint(c) {
  switch (c.kind) {
    case 'OfType': return ofType(text(c.constraintObj), c.type)
    case 'JustType': return `Type ${text(c.constraintObj)}`
    case 'JustSort': return `Sort ${text(c.constraintObj)}`
    case 'CmpInType': return ofType(compare(comparisonSymbol(c.comparison), c.constraintObjs), c.type)
    case 'CmpElim': {
      // Two eliminator lists compared under a list of polarities, each
      // printed as an Agda list: `[x, y] [*, +] [x', y'] : t`.
      /** @param {unknown[]} items */
      const list = items => `[${(items ?? []).map(text).join(', ')}]`
      const [left, right] = (c.constraintObjs ?? []).map(list)
      const polarities = (c.polarities ?? []).map(/** @param {string} p */ p => POLARITIES[p] ?? p)
      return ofType(`${left} ${list(polarities)} ${right}`, c.type)
    }
    case 'CmpTypes':
    case 'CmpLevels':
    case 'CmpTeles':
    case 'CmpSorts':
      return compare(comparisonSymbol(c.comparison), c.constraintObjs)
    case 'Assign': return `${text(c.constraintObj)} := ${text(c.value)}`
    case 'TypedAssign': return `${text(c.constraintObj)} := ${text(c.value)} :? ${text(c.type)}`
    case 'PostponedCheckArgs': {
      const args = (c.arguments ?? []).map(text).map(argument)
      const call = [`(_ : ${text(c.ofType)})`, ...args].join(' ')
      return `${text(c.constraintObj)} := ${ofType(call, c.type)}`
    }
    case 'IsEmptyType': return `Is empty: ${text(c.type)}`
    case 'SizeLtSat': return `Not empty type of sizes: ${text(c.type)}`
    case 'FindInstanceOF': {
      const candidates = (c.candidates ?? []).map(/** @param {{ value: unknown, type: unknown }} candidate */ candidate =>
        `    ${ofType(text(candidate.value), candidate.type)}`)
      return [
        `Resolve instance argument ${ofType(text(c.constraintObj), c.type)}`,
        '  Candidate:',
        ...candidates,
      ].join('\n')
    }
    case 'ResolveInstanceOF': return `Resolve output type of instance ${text(c.name)}`
    case 'PTSInstance': {
      const [a, b] = c.constraintObjs ?? []
      return `PTS instance for (${text(a)}, ${text(b)})`
    }
    case 'PostponedCheckFunDef': return `Check definition of ${text(c.name)} : ${text(c.type)}`
    case 'DataSort': return `Sort ${text(c.sort)} allows data/record definitions`
    case 'CheckLock': return `Check lock ${text(c.lock)} allows ${text(c.head)}`
    case 'UsableAtMod': return `Is usable at ${text(c.mod)} modality: ${text(c.term)}`
    default: return JSON.stringify(c)
  }
}

/** `Pretty Blocker`. @param {any} blocker @returns {string} */
export function formatBlocker(blocker) {
  switch (blocker?.kind) {
    case 'UnblockOnMeta': return `_${blocker.meta?.id ?? '?'}`
    case 'UnblockOnProblem': return `problem ${blocker.id}`
    case 'UnblockOnDef': return `definition ${text(blocker.name)}`
    case 'UnblockOnAll':
    case 'UnblockOnAny': {
      const word = blocker.kind === 'UnblockOnAll' ? 'all' : 'any'
      return `${word}(${(blocker.blockers ?? []).map(formatBlocker).join(', ')})`
    }
    default: return JSON.stringify(blocker)
  }
}

/** Agda's `prettyShow` of a range, without the file (always the one being
 *  edited here): `line,col-col`, or `line,col-line,col` across lines.
 *  @param {ConstraintInterval[] | undefined} range */
function formatConstraintRange(range) {
  return (range ?? []).map(({ start, end }) => start.line === end.line
    ? `${start.line},${start.col}-${end.col}`
    : `${start.line},${start.col}-${end.line},${end.col}`).join(', ')
}

/**
 * `Pretty (OutputForm a b)`: the constraint, then its range, then what it
 * is blocked on and which problems it belongs to, in parentheses.
 * @param {AgdaOutputForm} form
 */
export function formatOutputForm(form) {
  const parts = [formatOutputConstraint(form.constraint)]
  const range = formatConstraintRange(form.range)
  if (range) parts.push(`[ at ${range} ]`)

  const problems = form.problems ?? []
  const unblocker = form.unblocker
  const emptySet = (unblocker?.kind === 'UnblockOnAll' || unblocker?.kind === 'UnblockOnAny')
    && !(unblocker.blockers?.length)
  /** @type {string[]} */
  const reasons = []
  if (!unblocker || (emptySet && unblocker.kind === 'UnblockOnAll')) {
    // Not blocked on anything: nothing to say.
  } else if (emptySet) {
    reasons.push('stuck')
  } else {
    reasons.push(`blocked on ${formatBlocker(unblocker)}`)
  }
  if (problems.length === 1) reasons.push(`belongs to problem ${problems[0]}`)
  else if (problems.length > 1) reasons.push(`belongs to problems ${problems.join(', ')}`)
  if (reasons.length) parts.push(`(${reasons.join(', ')})`)
  return parts.join(' ')
}

/** @param {AgdaOutputForm[] | undefined} constraints */
export function formatConstraints(constraints) {
  if (!constraints?.length) return 'No constraints.'
  return constraints.map(formatOutputForm).join('\n')
}
