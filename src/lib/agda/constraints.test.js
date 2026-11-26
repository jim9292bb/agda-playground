/// <reference types="vitest/globals" />

import { formatBlocker, formatConstraints, formatOutputConstraint, formatOutputForm } from './constraints'

// What native Agda 2.7.0.1 sends for test-fixtures/agda/constraints-solve.agda,
// after Load (Cmd_constraints, --interaction-json).
const fixtureConstraints = [
  {
    constraint: { constraintObj: '?0', kind: 'Assign', value: 'z' },
    problems: [], range: [], unblocker: { blockers: [], kind: 'UnblockOnAll' },
  },
  {
    constraint: { comparison: 'CmpEq', constraintObjs: ['g _17', 'z'], kind: 'CmpInType', type: 'N' },
    problems: [27], range: [], unblocker: { kind: 'UnblockOnMeta', meta: { id: 17, module: 1135527178962 } },
  },
  {
    constraint: { constraintObj: '_18', kind: 'Assign', value: 'refl' },
    problems: [], range: [], unblocker: { id: 27, kind: 'UnblockOnProblem' },
  },
]

describe('formatConstraints', () => {
  it("renders Agda's own constraint list the way Emacs' *Constraints* buffer does", () => {
    // Emacs' output for the same file (agda --interaction).
    expect(formatConstraints(fixtureConstraints)).toBe([
      '?0 := z',
      'g _17 = z : N (blocked on _17, belongs to problem 27)',
      '_18 := refl (blocked on problem 27)',
    ].join('\n'))
  })

  it('says so when there are none', () => {
    expect(formatConstraints([])).toBe('No constraints.')
    expect(formatConstraints(undefined)).toBe('No constraints.')
  })
})

describe('formatOutputForm', () => {
  const assign = { kind: 'Assign', constraintObj: '_1', value: 'x' }

  it('adds the range, without a file name', () => {
    const range = [{ start: { line: 3, col: 5 }, end: { line: 3, col: 9 } }]
    expect(formatOutputForm({ constraint: assign, range })).toBe('_1 := x [ at 3,5-9 ]')
    const multiline = [{ start: { line: 3, col: 5 }, end: { line: 4, col: 2 } }]
    expect(formatOutputForm({ constraint: assign, range: multiline })).toBe('_1 := x [ at 3,5-4,2 ]')
  })

  it('says "stuck" for an empty any-blocker and lists several problems', () => {
    expect(formatOutputForm({ constraint: assign, unblocker: { kind: 'UnblockOnAny', blockers: [] }, problems: [1, 2] }))
      .toBe('_1 := x (stuck, belongs to problems 1, 2)')
  })
})

describe('formatBlocker', () => {
  it.each([
    [{ kind: 'UnblockOnMeta', meta: { id: 4, module: 9 } }, '_4'],
    [{ kind: 'UnblockOnProblem', id: 2 }, 'problem 2'],
    [{ kind: 'UnblockOnDef', name: 'f' }, 'definition f'],
    [{ kind: 'UnblockOnAll', blockers: [{ kind: 'UnblockOnMeta', meta: { id: 1 } }, { kind: 'UnblockOnProblem', id: 3 }] }, 'all(_1, problem 3)'],
    [{ kind: 'UnblockOnAny', blockers: [{ kind: 'UnblockOnMeta', meta: { id: 1 } }] }, 'any(_1)'],
  ])('%j -> %s', (blocker, expected) => {
    expect(formatBlocker(blocker)).toBe(expected)
  })
})

describe('formatOutputConstraint', () => {
  it.each([
    [{ kind: 'OfType', constraintObj: '_1', type: 'N' }, '_1 : N'],
    [{ kind: 'JustType', constraintObj: '_1' }, 'Type _1'],
    [{ kind: 'JustSort', constraintObj: '_1' }, 'Sort _1'],
    [{ kind: 'CmpInType', comparison: 'CmpLeq', constraintObjs: ['a', 'b'], type: 'Size' }, 'a =< b : Size'],
    [{ kind: 'CmpElim', polarities: ['Invariant', 'Covariant'], constraintObjs: [['x', 'y'], ['x\'', 'y\'']], type: 'T' }, "[x, y] [*, +] [x', y'] : T"],
    [{ kind: 'CmpTypes', comparison: 'CmpEq', constraintObjs: ['A', 'B'] }, 'A = B'],
    [{ kind: 'CmpSorts', comparison: 'CmpLeq', constraintObjs: ['Set', 'Set₁'] }, 'Set =< Set₁'],
    [{ kind: 'TypedAssign', constraintObj: '_1', value: 'z', type: 'N' }, '_1 := z :? N'],
    [{ kind: 'PostponedCheckArgs', constraintObj: '_1', ofType: 'N → N', arguments: ['z', 's z'], type: 'N' }, '_1 := (_ : N → N) z (s z) : N'],
    [{ kind: 'IsEmptyType', type: 'Fin 0' }, 'Is empty: Fin 0'],
    [{ kind: 'SizeLtSat', type: 'Size< i' }, 'Not empty type of sizes: Size< i'],
    [{ kind: 'ResolveInstanceOF', name: 'show' }, 'Resolve output type of instance show'],
    [{ kind: 'PTSInstance', constraintObjs: ['Set', 'Set₁'] }, 'PTS instance for (Set, Set₁)'],
    [{ kind: 'PostponedCheckFunDef', name: 'f', type: 'N → N', error: {} }, 'Check definition of f : N → N'],
    [{ kind: 'DataSort', name: 'D', sort: 'Set' }, 'Sort Set allows data/record definitions'],
    [{ kind: 'CheckLock', head: 't', lock: 'lk' }, 'Check lock lk allows t'],
    [{ kind: 'UsableAtMod', mod: 'irrelevant', term: 'x' }, 'Is usable at irrelevant modality: x'],
  ])('%j -> %s', (constraint, expected) => {
    expect(formatOutputConstraint(constraint)).toBe(expected)
  })

  it('lists instance candidates below the instance being resolved', () => {
    expect(formatOutputConstraint({
      kind: 'FindInstanceOF', constraintObj: '_1', type: 'Show N',
      candidates: [{ value: 'showN', type: 'Show N' }],
    })).toBe('Resolve instance argument _1 : Show N\n  Candidate:\n    showN : Show N')
  })

  it("falls back to the raw JSON for a kind it doesn't know", () => {
    expect(formatOutputConstraint({ kind: 'Future' })).toBe('{"kind":"Future"}')
  })
})
