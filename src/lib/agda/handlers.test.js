/// <reference types="vitest/globals" />

import { EditorState } from '@codemirror/state'
import { offsetTracking } from '$lib/codemirror/offsets'
import { agdaGoalState, getAgdaGoals } from './goal-state'
import { highlightState } from './highlight'
import { buildGoalTransaction } from './goals'
import { makeLSPResponseHandlerMap } from './handlers'

// See editor-mutations.test.js: none of these handlers touch any
// DOM-specific EditorView API beyond `.state` and `.dispatch`.
class FakeEditorView {
  /** @param {import('@codemirror/state').EditorState} state */
  constructor(state) {
    this.state = state
    /** @type {import('@codemirror/state').TransactionSpec[]} */
    this.dispatchLog = []
  }
  /** @param {import('@codemirror/state').TransactionSpec} spec */
  dispatch(spec) {
    this.dispatchLog.push(spec)
    this.state = this.state.update(spec).state
  }
}

function makeController() {
  return {
    checked: false,
    showImplicitArgs: false,
    showIrrelevantArgs: false,
    suppressAgdaInternalErrors: false,
    suppressDisplayInfo: false,
    lastAgdaInternalError: /** @type {string | null} */ (null),
    lastAgdaError: /** @type {string | null} */ (null),
    lastAgdaDiagnostics: /** @type {any[]} */ ([]),
    lastJumpToError: /** @type {any} */ (null),
    pendingCaseSplitGoal: /** @type {any} */ (undefined),
    pendingGiveGoal: /** @type {any} */ (undefined),
    activeDocumentVersion: /** @type {number | null} */ (null),
    acceptsDocumentVersion(/** @type {number} */ v) {
      return this.activeDocumentVersion == null || this.activeDocumentVersion === v
    },
    acceptDocumentVersion(/** @type {number} */ v) {
      this.activeDocumentVersion = v
    },
    /** @type {{label: string, content: string}[]} */
    queryResults: [],
    appendQueryResult(/** @type {string} */ label, /** @type {string} */ content) {
      this.queryResults.push({ label, content })
    },
  }
}

/** @param {string} doc */
function makeSetup(doc) {
  const state = EditorState.create({ doc, extensions: [offsetTracking(), agdaGoalState, highlightState] })
  const view = new FakeEditorView(state)
  const controller = makeController()
  const handlers = makeLSPResponseHandlerMap(controller, /** @type {any} */ (view))
  return { view, controller, handlers }
}

describe('ResponseStatus', () => {
  it('copies checked/showImplicitArgs onto the controller', () => {
    const { controller, handlers } = makeSetup('')
    handlers.ResponseStatus?.([true, true])
    expect(controller.checked).toBe(true)
    expect(controller.showImplicitArgs).toBe(true)
  })
})

describe('ResponseJSONRaw > Status', () => {
  it('copies all three status flags', () => {
    const { controller, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'Status',
      status: { checked: true, showImplicitArguments: false, showIrrelevantArguments: true },
    }))
    expect(controller.checked).toBe(true)
    expect(controller.showImplicitArgs).toBe(false)
    expect(controller.showIrrelevantArgs).toBe(true)
  })
})

describe('ResponseJSONRaw > DisplayInfo', () => {
  it('records an Error message as lastAgdaError with a parsed diagnostic', () => {
    const { controller, handlers } = makeSetup('')
    const message = '/source.agda:1.1-2: error: [Foo] Something went wrong'
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'DisplayInfo',
      info: { kind: 'Error', error: { message } },
    }))
    expect(controller.lastAgdaError).toBe(message)
    expect(controller.lastAgdaDiagnostics).toHaveLength(1)
  })

  it('suppresses an internal-error message instead of surfacing it as a normal error', () => {
    const { controller, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'DisplayInfo',
      info: { kind: 'Error', error: { message: 'An internal error has occurred: boom' } },
    }))
    expect(controller.lastAgdaInternalError).toContain('boom')
    expect(controller.lastAgdaError).toBeNull()
  })

  it('routes a GoalSpecific/GoalType result to appendQueryResult, combining type and context', () => {
    const { controller, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'DisplayInfo',
      info: {
        kind: 'GoalSpecific',
        interactionPoint: { id: 0 },
        goalInfo: {
          kind: 'GoalType',
          type: 'Nat',
          entries: [{ inScope: true, reifiedName: 'n', originalName: 'n', binding: 'Nat' }],
        },
      },
    }))
    expect(controller.queryResults).toEqual([
      { label: 'Goal Type and Context', content: expect.stringContaining('Nat') },
    ])
  })

  it('keeps out-of-scope context entries, suffixed "(not in scope)", instead of dropping them', () => {
    const { controller, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'DisplayInfo',
      info: {
        kind: 'GoalSpecific',
        interactionPoint: { id: 0 },
        goalInfo: {
          kind: 'GoalType',
          type: 'eq y x',
          entries: [
            { inScope: true, reifiedName: 'e', originalName: 'e', binding: 'eq x y' },
            { inScope: false, reifiedName: 'y', originalName: 'y', binding: 'A' },
            { inScope: false, reifiedName: 'x', originalName: 'x', binding: 'A' },
            { inScope: false, reifiedName: 'A', originalName: 'A', binding: 'Set' },
          ],
        },
      },
    }))
    expect(controller.queryResults).toEqual([
      {
        label: 'Goal Type and Context',
        content: expect.stringContaining(
          'e : eq x y\ny : A (not in scope)\nx : A (not in scope)\nA : Set (not in scope)',
        ),
      },
    ])
  })

  it('dispatches setGoalInfo with the goal type/context for a GoalSpecific response', () => {
    const { view, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'DisplayInfo',
      info: {
        kind: 'GoalSpecific',
        interactionPoint: { id: 7 },
        goalInfo: { kind: 'GoalType', type: 'Bool', entries: [] },
      },
    }))
    const setGoalInfoSpec = view.dispatchLog.find(spec =>
      /** @type {any} */ (spec.effects)?.value?.[0]?.id === 7)
    expect(setGoalInfoSpec).toBeDefined()
  })

  it('discards everything (no controller mutation, no dispatch) when the response is stale', () => {
    const { view, controller, handlers } = makeSetup('')
    controller.activeDocumentVersion = 999 // current doc version is 0, so this response is now stale
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'DisplayInfo',
      info: { kind: 'Error', error: { message: 'stale error' } },
    }))
    expect(controller.lastAgdaError).toBeNull()
    expect(view.dispatchLog).toEqual([])
  })

  it('appends query results instead of the running-info log when not suppressed', () => {
    const { controller, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'DisplayInfo',
      info: { kind: 'NormalForm', expr: '42' },
    }))
    expect(controller.queryResults).toEqual([{ label: 'Normal Form', content: '42' }])
  })
})

describe('ResponseJSONRaw > ClearRunningInfo / RunningInfo', () => {
  it('dispatches a clearRunningInfo effect', () => {
    const { view, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({ kind: 'ClearRunningInfo' }))
    expect(view.dispatchLog).toHaveLength(1)
  })

  it('dispatches an emitRunningInfo effect carrying the message/debugLevel', () => {
    const { view, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({ kind: 'RunningInfo', message: 'checking...', debugLevel: 2 }))
    const spec = /** @type {any} */ (view.dispatchLog[0])
    expect(spec.effects.value).toEqual({ message: 'checking...', debugLevel: 2 })
  })
})

describe('ResponseJSONRaw > ClearHighlighting', () => {
  it('throws for the (unimplemented-by-Agda) TokenBased variant', () => {
    const { handlers } = makeSetup('')
    expect(() =>
      handlers.ResponseJSONRaw?.(/** @type {any} */ ({ kind: 'ClearHighlighting', tokenBased: 'TokenBased' }))
    ).toThrow(/not implemented/)
  })

  it('dispatches clearHighlight and accepts the current document version for NotOnlyTokenBased', () => {
    const { view, controller, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({ kind: 'ClearHighlighting', tokenBased: 'NotOnlyTokenBased' }))
    expect(view.dispatchLog).toHaveLength(1)
    expect(controller.activeDocumentVersion).toBe(0)
  })
})

describe('ResponseJSONRaw > InteractionPoints', () => {
  it('registers a tracked goal for each interaction point', () => {
    const { view, handlers } = makeSetup('foo = ?')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'InteractionPoints',
      interactionPoints: [
        { id: 0, range: [{ start: { pos: 7, line: 1, col: 7 }, end: { pos: 8, line: 1, col: 8 } }] },
      ],
    }))
    expect(view.state.doc.toString()).toBe('foo = {!  !}')
    expect(getAgdaGoals(view.state)).toHaveLength(1)
  })
})

describe('ResponseJSONRaw > GiveAction', () => {
  it('replaces the goal content on success', () => {
    const state = EditorState.create({ doc: 'foo = ?', extensions: [offsetTracking(), agdaGoalState, highlightState] })
    const view = new FakeEditorView(state)
    const controller = makeController()
    const handlers = makeLSPResponseHandlerMap(controller, /** @type {any} */ (view))
    view.dispatch(buildGoalTransaction(view.state, [
      { id: 0, range: [{ start: { pos: 7, line: 1, col: 7 }, end: { pos: 8, line: 1, col: 8 } }] },
    ]))

    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'GiveAction',
      interactionPoint: { id: 0 },
      giveResult: { str: 'zero' },
    }))
    expect(view.state.doc.toString()).toBe('foo = zero')
  })

  it('emits a "could not find goal" message when the goal is gone', () => {
    const { view, handlers } = makeSetup('foo = bar')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({
      kind: 'GiveAction',
      interactionPoint: { id: 3 },
      giveResult: { str: 'zero' },
    }))
    const emitSpec = view.dispatchLog.find(spec =>
      /** @type {any} */ (spec.effects)?.value?.message?.includes('Could not find goal'))
    expect(emitSpec).toBeDefined()
  })
})

describe('ResponseJSONRaw > MakeCase', () => {
  it('emits the joined clauses as a message when there is no pending case-split goal', () => {
    const { view, handlers } = makeSetup('')
    handlers.ResponseJSONRaw?.(/** @type {any} */ ({ kind: 'MakeCase', clauses: ['zero -> ?', 'suc n -> ?'] }))
    const spec = /** @type {any} */ (view.dispatchLog[0])
    expect(spec.effects.value.message).toBe('zero -> ?\nsuc n -> ?\n')
  })
})
