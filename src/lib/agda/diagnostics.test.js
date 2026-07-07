/// <reference types="vitest/globals" />

import { parseAgdaDiagnostic } from './diagnostics'

describe('parseAgdaDiagnostic', () => {
  it('parses same-line Agda errors with a code', () => {
    expect(parseAgdaDiagnostic('/source.agda:7.16-17: error: [NotInScope]\nNot in scope:\n  a')).toEqual({
      filepath: '/source.agda',
      line: 7,
      column: 16,
      endLine: 7,
      endColumn: 17,
      severity: 'error',
      code: 'NotInScope',
      message: 'Not in scope:\n  a',
    })
  })

  it('parses multi-line ranges', () => {
    expect(parseAgdaDiagnostic('/source.agda:3.4-4.5: warning: [CoverageIssue]\nMissing cases')).toEqual({
      filepath: '/source.agda',
      line: 3,
      column: 4,
      endLine: 4,
      endColumn: 5,
      severity: 'warning',
      code: 'CoverageIssue',
      message: 'Missing cases',
    })
  })

  it('returns null for unstructured output', () => {
    expect(parseAgdaDiagnostic('Loading /source.agda...')).toBeNull()
  })

  // Agda < 2.8 (ALS 2.6.4.3 / 2.7.0.1) uses a comma between line and column
  // and never embeds an "error:"/"warning:" marker or error code — the
  // caller must supply defaultSeverity. Samples captured from real ALS
  // WASM output.
  it('parses comma-separated positions from Agda < 2.8, using defaultSeverity', () => {
    expect(parseAgdaDiagnostic('/source.agda:5,7-8\nNot in scope:\n  x', 'error')).toEqual({
      filepath: '/source.agda',
      line: 5,
      column: 7,
      endLine: 5,
      endColumn: 8,
      severity: 'error',
      code: undefined,
      message: 'Not in scope:\n  x',
    })
  })

  it('defaults comma-format severity to "warning" when the caller says so', () => {
    const diagnostic = parseAgdaDiagnostic('/source.agda:6,1-9\nMissing cases', 'warning')
    expect(diagnostic?.severity).toBe('warning')
  })

  it('falls back to defaultSeverity="error" when omitted', () => {
    const diagnostic = parseAgdaDiagnostic('/source.agda:5,7-8\nNot in scope')
    expect(diagnostic?.severity).toBe('error')
  })
})
