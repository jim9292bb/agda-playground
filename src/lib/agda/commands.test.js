/// <reference types="vitest/globals" />

import {
  goalTypeCommand,
  contextCommand,
  goalTypeContextCommand,
  goalTypeContextInferCommand,
  goalTypeContextCheckCommand,
  searchAboutToplevelCommand,
  moduleContentsCommand,
  moduleContentsToplevelCommand,
  whyInScopeCommand,
  whyInScopeToplevelCommand,
  giveCommand,
  refineCommand,
  autoOneCommand,
  elaborateGiveCommand,
  makeCaseCommand,
  helperFunctionCommand,
  inferCommand,
  inferToplevelCommand,
  computeCommand,
  computeToplevelCommand,
  toggleImplicitArgsCommand,
  toggleIrrelevantArgsCommand,
} from './commands'

const goal = { id: 3 }

describe('goal-scoped commands with no user content', () => {
  it('goalTypeCommand', () => {
    expect(goalTypeCommand('Simplified', goal)).toBe('(Cmd_goal_type Simplified 3 noRange "")')
  })

  it('contextCommand', () => {
    expect(contextCommand('Normalised', goal)).toBe('(Cmd_context Normalised 3 noRange "")')
  })

  it('goalTypeContextCommand', () => {
    expect(goalTypeContextCommand('AsIs', goal)).toBe('(Cmd_goal_type_context AsIs 3 noRange "")')
  })
})

describe('goal-scoped commands with quoted user content', () => {
  it('goalTypeContextInferCommand', () => {
    expect(goalTypeContextInferCommand('Simplified', goal, 'x + 1')).toBe(
      '(Cmd_goal_type_context_infer Simplified 3 noRange "x + 1")'
    )
  })

  it('goalTypeContextCheckCommand', () => {
    expect(goalTypeContextCheckCommand('Simplified', goal, 'x')).toBe(
      '(Cmd_goal_type_context_check Simplified 3 noRange "x")'
    )
  })

  it('moduleContentsCommand', () => {
    expect(moduleContentsCommand('Simplified', goal, 'Data.List')).toBe(
      '(Cmd_show_module_contents Simplified 3 noRange "Data.List")'
    )
  })

  it('whyInScopeCommand', () => {
    expect(whyInScopeCommand(goal, 'foo')).toBe('(Cmd_why_in_scope 3 noRange "foo")')
  })

  it('helperFunctionCommand', () => {
    expect(helperFunctionCommand('Simplified', goal, 'h')).toBe(
      '(Cmd_helper_function Simplified 3 noRange "h")'
    )
  })

  it('inferCommand', () => {
    expect(inferCommand('Instantiated', goal, 'x')).toBe('(Cmd_infer Instantiated 3 noRange "x")')
  })

  it('computeCommand', () => {
    expect(computeCommand('IgnoreAbstract', goal, 'x')).toBe(
      '(Cmd_compute IgnoreAbstract 3 noRange "x")'
    )
  })

  it('elaborateGiveCommand', () => {
    expect(elaborateGiveCommand('Simplified', goal, 'x')).toBe(
      '(Cmd_elaborate_give Simplified 3 noRange "x")'
    )
  })
})

describe('toplevel commands (no goal)', () => {
  it('searchAboutToplevelCommand', () => {
    expect(searchAboutToplevelCommand('Simplified', 'map')).toBe(
      '(Cmd_search_about_toplevel Simplified "map")'
    )
  })

  it('moduleContentsToplevelCommand', () => {
    expect(moduleContentsToplevelCommand('Simplified', 'Data.List')).toBe(
      '(Cmd_show_module_contents_toplevel Simplified "Data.List")'
    )
  })

  it('whyInScopeToplevelCommand', () => {
    expect(whyInScopeToplevelCommand('foo')).toBe('(Cmd_why_in_scope_toplevel "foo")')
  })

  it('inferToplevelCommand', () => {
    expect(inferToplevelCommand('Simplified', 'x + 1')).toBe(
      '(Cmd_infer_toplevel Simplified "x + 1")'
    )
  })

  it('computeToplevelCommand', () => {
    expect(computeToplevelCommand('DefaultCompute', 'x + 1')).toBe(
      '(Cmd_compute_toplevel DefaultCompute "x + 1")'
    )
  })
})

describe('range-taking commands (give/refine/auto/makeCase)', () => {
  it('giveCommand', () => {
    expect(giveCommand(goal, 'noRange', 'x')).toBe('(Cmd_give WithoutForce 3 noRange "x")')
  })

  it('refineCommand', () => {
    expect(refineCommand(goal, 'noRange', 'x')).toBe('(Cmd_refine_or_intro False 3 noRange "x")')
  })

  it('autoOneCommand', () => {
    expect(autoOneCommand('Simplified', goal, 'noRange', 'x')).toBe(
      '(Cmd_autoOne Simplified 3 noRange "x")'
    )
  })

  it('makeCaseCommand', () => {
    expect(makeCaseCommand(goal, 'noRange', 'x')).toBe('(Cmd_make_case 3 noRange "x")')
  })

  it('passes a real range string through unquoted', () => {
    const range = '(intervalsToRange (Just (mkAbsolute "/source.agda")) [])'
    expect(giveCommand(goal, range, 'x')).toBe(`(Cmd_give WithoutForce 3 ${range} "x")`)
  })
})

describe('content quoting', () => {
  it('JSON-escapes quotes and backslashes in user content', () => {
    expect(inferCommand('Simplified', goal, 'a "b" \\c')).toBe(
      '(Cmd_infer Simplified 3 noRange "a \\"b\\" \\\\c")'
    )
  })

  it('escapes newlines in user content', () => {
    expect(inferCommand('Simplified', goal, 'a\nb')).toBe('(Cmd_infer Simplified 3 noRange "a\\nb")')
  })
})

describe('implicit/irrelevant args toggles', () => {
  it('toggleImplicitArgsCommand', () => {
    expect(toggleImplicitArgsCommand()).toBe('(ToggleImplicitArgs)')
  })

  it('toggleIrrelevantArgsCommand', () => {
    expect(toggleIrrelevantArgsCommand()).toBe('(ToggleIrrelevantArgs)')
  })
})
