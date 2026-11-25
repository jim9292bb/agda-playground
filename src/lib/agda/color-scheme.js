import { EditorView } from '@codemirror/view'

/** The light Agda highlighting palette, as an `EditorView.theme` spec. */
export const agdaLightSchemeSpec = {
  // Holes: an amber chip, like the goal badges in the side panel.
  '.agda-hole': {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    boxShadow: 'inset 0 0 0 1px #d9770680',
    borderRadius: '3px',
  },
  '.agda-hole[data-goal-id]::after': {
    content: 'attr(data-goal-id)',
    marginInlineStart: '0.2em',
    fontFamily: 'inherit',
    color: '#92400e',
    fontSize: 'inherit',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  // make error markers opaque
  '.agda-error *': { color: 'currentColor !important' },

  // "Scientific Blue": keywords violet, types blue, functions teal,
  // constructors green. Every text color meets WCAG AA (4.5:1) on the
  // editor's backgrounds and inside holes -- see color-scheme.test.js.
  // definitions are from `Agda/Syntax/Common/Aspect.hs`
  // strings are from `toAtoms :: Aspects -> [String]`

  // -- aspects
  '.agda-comment':                  { color: '#607086', fontStyle: 'italic' },
  '.agda-keyword':                  { color: '#7c3aed', fontWeight: '550' },
  '.agda-string':                   { color: '#c2410c' },
  '.agda-number':                   { color: '#a21caf' },
  //   hole; see above
  '.agda-symbol':                   { color: '#475569' },
  '.agda-primitivetype':            { color: '#1d4ed8' },
  //   -- name kinds
  //     bound
  //     generalizable
    '.agda-inductiveconstructor':   { color: '#047857' },
    '.agda-coinductiveconstructor': { color: '#8f5a06' },
    '.agda-datatype':               { color: '#1d4ed8' },
    '.agda-field':                  { color: '#be185d' },
    '.agda-function':               { color: '#0b7380' },
    '.agda-module':                 { color: '#4338ca' },
    '.agda-postulate':              { color: '#1d4ed8' },
    '.agda-primitive':              { color: '#1d4ed8' },
    '.agda-record':                 { color: '#1d4ed8' },
  //     argument
    '.agda-macro':                  { color: '#0e7490' },
  //   -- end of name kinds
  //   pragma, background, markup

  // -- "other" aspects
  '.agda-error':                    { color: '#c81e1e' },
  '.agda-errorwarning':             { backgroundColor: '#f0808080' },  // light coral
  // dottedpattern
  '.agda-unsolvedmeta':             { backgroundColor: '#ffff0080' },  // yellow
  '.agda-unsolvedconstraint':       { backgroundColor: '#ffff0080' },  // yellow
  '.agda-terminationproblem':       { backgroundColor: '#ffa07a80' },  // light salmon
  '.agda-positivityproblem':        { backgroundColor: '#cd853f80' },  // peru
  '.agda-deadcode':                 { backgroundColor: '#a9a9a980' },  // dark gray
  '.agda-shadowingintelescope':     { backgroundColor: '#a9a9a980' },  // dark gray
  '.agda-coverageproblem':          { backgroundColor: '#f5deb380' },  // wheat
  // incompletepattern
  '.agda-typechecks':               { color: 'black', backgroundColor: '#add8e680' },  // light blue
  '.agda-missingdefinition':        { backgroundColor: '#ffa50080' },  // orange
  '.agda-instanceproblem':          { backgroundColor: '#f5deb380' },  // wheat
  '.agda-cosmeticproblem':          { backgroundColor: '#f5f5f580' },  // white smoke
  '.agda-catchallclause':           { backgroundColor: '#f5f5f580' },  // white smoke
  '.agda-confluenceproblem':        { backgroundColor: '#ffc0cb80' },  // pink
}

export const agdaLightScheme = EditorView.theme(agdaLightSchemeSpec)

/** The dark Agda highlighting palette, as an `EditorView.theme` spec. */
export const agdaDarkSchemeSpec = {
  // Holes: an amber chip, like the goal badges in the side panel.
  '.agda-hole': {
    backgroundColor: '#42351e',
    color: '#fbbf24',
    boxShadow: 'inset 0 0 0 1px #f59e0b66',
    borderRadius: '3px',
  },
  '.agda-hole[data-goal-id]::after': {
    content: 'attr(data-goal-id)',
    marginInlineStart: '0.2em',
    fontFamily: 'inherit',
    color: '#fbbf24',
    fontSize: 'inherit',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  // make error markers opaque
  '.agda-error *': { color: 'currentColor !important' },

  // "Scientific Blue": keywords violet, types blue, functions teal,
  // constructors green. Every text color meets WCAG AA (4.5:1) on the
  // editor's backgrounds and inside holes -- see color-scheme.test.js.
  // definitions are from `Agda/Syntax/Common/Aspect.hs`
  // strings are from `toAtoms :: Aspects -> [String]`

  // -- aspects
  '.agda-comment':                  { color: '#94a3b8', fontStyle: 'italic' },
  '.agda-keyword':                  { color: '#c4b5fd', fontWeight: '550' },
  '.agda-string':                   { color: '#fdba74' },
  '.agda-number':                   { color: '#f0abfc' },
  //   hole; see above
  '.agda-symbol':                   { color: '#cbd5e1' },
  '.agda-primitivetype':            { color: '#93c5fd' },
  //   -- name kinds
  //     bound
  //     generalizable
    '.agda-inductiveconstructor':   { color: '#6ee7b7' },
    '.agda-coinductiveconstructor': { color: '#fcd34d' },
    '.agda-datatype':               { color: '#93c5fd' },
    '.agda-field':                  { color: '#f9a8d4' },
    '.agda-function':               { color: '#5eead4' },
    '.agda-module':                 { color: '#a5b4fc' },
    '.agda-postulate':              { color: '#93c5fd' },
    '.agda-primitive':              { color: '#93c5fd' },
    '.agda-record':                 { color: '#93c5fd' },
  //     argument
    '.agda-macro':                  { color: '#67e8f9' },
  //   -- end of name kinds
  //   pragma, background, markup

  // -- "other" aspects
  '.agda-error':                    { color: '#fa8585' },
  '.agda-errorwarning':             { backgroundColor: '#80240080' },
  // dottedpattern
  '.agda-unsolvedmeta':             { backgroundColor: '#806B0080' },
  '.agda-unsolvedconstraint':       { backgroundColor: '#806B0080' },
  '.agda-terminationproblem':       { backgroundColor: '#80240080' },
  '.agda-positivityproblem':        { backgroundColor: '#803F0080' },
  '.agda-deadcode':                 { backgroundColor: '#80808080' },
  '.agda-shadowingintelescope':     { backgroundColor: '#80808080' },
  '.agda-coverageproblem':          { backgroundColor: '#80530080' },
  // incompletepattern
  '.agda-typechecks':               { color: 'white', backgroundColor: '#00608080' },
  '.agda-missingdefinition':        { backgroundColor: '#80404080' },
  '.agda-instanceproblem':          { backgroundColor: '#80530080' },
  '.agda-cosmeticproblem':          { backgroundColor: '#40404080' },
  '.agda-catchallclause':           { backgroundColor: '#40404080' },
  '.agda-confluenceproblem':        { backgroundColor: '#80008080' },
}

export const agdaDarkScheme = EditorView.theme(agdaDarkSchemeSpec, { dark: true })
