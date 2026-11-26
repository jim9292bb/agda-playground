import { EditorView } from '@codemirror/view'

/** The light Agda highlighting palette, as an `EditorView.theme` spec. */
export const agdaLightSchemeSpec = {
  // Holes: Emacs's `highlight` face (darkseagreen2 #b4eeb4), which agda2-mode
  // puts on every goal. Background only: the hole's contents keep their own
  // colors, and the goal number shares the chip.
  '.agda-hole': {
    backgroundColor: '#b4eeb4',
  },
  '.agda-hole[data-goal-id]::after': {
    content: 'attr(data-goal-id)',
    marginInlineStart: '0.2em',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  // make error markers opaque
  '.agda-error *': { color: 'currentColor !important' },

  // Agda's Emacs mode defaults, as is: the light-background faces of
  // `agda2-highlight.el` (agda/src/data/emacs-mode), and Emacs's own
  // `font-lock-comment-face` (Firebrick) for comments. Kept identical to
  // Emacs on purpose, so some colors fall short of WCAG AA on this app's
  // backgrounds -- see color-scheme.test.js.
  // definitions are from `Agda/Syntax/Common/Aspect.hs`
  // strings are from `toAtoms :: Aspects -> [String]`

  // -- aspects
  '.agda-comment':                  { color: '#b22222' },  // Firebrick
  '.agda-keyword':                  { color: '#cd6600' },  // DarkOrange3
  '.agda-string':                   { color: '#b22222' },  // firebrick
  '.agda-number':                   { color: '#a020f0' },  // purple
  //   hole; see above
  '.agda-symbol':                   { color: '#404040' },  // gray25
  '.agda-primitivetype':            { color: '#0000cd' },  // medium blue
  //   -- name kinds
  //     bound
  //     generalizable
    '.agda-inductiveconstructor':   { color: '#008b00' },  // green4
    '.agda-coinductiveconstructor': { color: '#8b7500' },  // gold4
    '.agda-datatype':               { color: '#0000cd' },
    '.agda-field':                  { color: '#ee1289' },  // DeepPink2
    '.agda-function':               { color: '#0000cd' },
    '.agda-module':                 { color: '#a020f0' },  // purple
    '.agda-postulate':              { color: '#0000cd' },
    '.agda-primitive':              { color: '#0000cd' },
    '.agda-record':                 { color: '#0000cd' },
  //     argument
    '.agda-macro':                  { color: '#458b74' },  // aquamarine4
  //   -- end of name kinds
  //   pragma, background, markup

  // -- "other" aspects
  '.agda-error':                    { color: '#ff0000', textDecoration: 'underline' },  // red
  '.agda-errorwarning':             { backgroundColor: '#f08080', textDecoration: 'underline' },  // light coral
  // dottedpattern
  '.agda-unsolvedmeta':             { backgroundColor: '#ffff00' },  // yellow
  '.agda-unsolvedconstraint':       { backgroundColor: '#ffff00' },  // yellow
  '.agda-terminationproblem':       { backgroundColor: '#ffa07a' },  // light salmon
  '.agda-positivityproblem':        { backgroundColor: '#cd853f' },  // peru
  '.agda-deadcode':                 { backgroundColor: '#a9a9a9' },  // dark gray
  '.agda-shadowingintelescope':     { backgroundColor: '#a9a9a9' },  // dark gray
  '.agda-coverageproblem':          { backgroundColor: '#f5deb3' },  // wheat
  // incompletepattern
  '.agda-typechecks':               { color: 'black', backgroundColor: '#add8e6' },  // light blue
  '.agda-missingdefinition':        { backgroundColor: '#ffa500' },  // orange
  '.agda-instanceproblem':          { backgroundColor: '#f5deb3' },  // wheat
  '.agda-cosmeticproblem':          { backgroundColor: '#f5f5f5' },  // white smoke
  '.agda-catchallclause':           { backgroundColor: '#f5f5f5' },  // white smoke
  '.agda-confluenceproblem':        { backgroundColor: '#ffc0cb' },  // pink
}

export const agdaLightScheme = EditorView.theme(agdaLightSchemeSpec)

/** The dark Agda highlighting palette, as an `EditorView.theme` spec. */
export const agdaDarkSchemeSpec = {
  // Holes: Emacs's `highlight` face (darkolivegreen #556b2f), which agda2-mode
  // puts on every goal. Background only: the hole's contents keep their own
  // colors, and the goal number shares the chip.
  '.agda-hole': {
    backgroundColor: '#556b2f',
  },
  '.agda-hole[data-goal-id]::after': {
    content: 'attr(data-goal-id)',
    marginInlineStart: '0.2em',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  // make error markers opaque
  '.agda-error *': { color: 'currentColor !important' },

  // Agda's Emacs mode defaults, as is: the dark-background faces of
  // `agda2-highlight.el` (agda/src/data/emacs-mode), and Emacs's own
  // `font-lock-comment-face` (chocolate1) for comments. Kept identical to
  // Emacs on purpose, so some colors fall short of WCAG AA on this app's
  // backgrounds -- see color-scheme.test.js.
  // definitions are from `Agda/Syntax/Common/Aspect.hs`
  // strings are from `toAtoms :: Aspects -> [String]`

  // -- aspects
  '.agda-comment':                  { color: '#ff7f24' },
  '.agda-keyword':                  { color: '#ff9932' },
  '.agda-string':                   { color: '#dd4d4d' },
  '.agda-number':                   { color: '#9010e0' },
  //   hole; see above
  '.agda-symbol':                   { color: '#bfbfbf' },
  '.agda-primitivetype':            { color: '#8080ff' },
  //   -- name kinds
  //     bound
  //     generalizable
    '.agda-inductiveconstructor':   { color: '#29cc29' },
    '.agda-coinductiveconstructor': { color: '#ffea75' },
    '.agda-datatype':               { color: '#8080ff' },
    '.agda-field':                  { color: '#f570b7' },
    '.agda-function':               { color: '#8080ff' },
    '.agda-module':                 { color: '#cd80ff' },
    '.agda-postulate':              { color: '#8080ff' },
    '.agda-primitive':              { color: '#8080ff' },
    '.agda-record':                 { color: '#8080ff' },
  //     argument
    '.agda-macro':                  { color: '#73baa2' },
  //   -- end of name kinds
  //   pragma, background, markup

  // -- "other" aspects
  '.agda-error':                    { color: '#ff0000', textDecoration: 'underline' },
  '.agda-errorwarning':             { backgroundColor: '#802400', textDecoration: 'underline' },
  // dottedpattern
  '.agda-unsolvedmeta':             { backgroundColor: '#806b00' },
  '.agda-unsolvedconstraint':       { backgroundColor: '#806b00' },
  '.agda-terminationproblem':       { backgroundColor: '#802400' },
  '.agda-positivityproblem':        { backgroundColor: '#803f00' },
  '.agda-deadcode':                 { backgroundColor: '#808080' },
  '.agda-shadowingintelescope':     { backgroundColor: '#808080' },
  '.agda-coverageproblem':          { backgroundColor: '#805300' },
  // incompletepattern
  '.agda-typechecks':               { color: 'white', backgroundColor: '#006080' },
  '.agda-missingdefinition':        { backgroundColor: '#804040' },
  '.agda-instanceproblem':          { backgroundColor: '#805300' },
  '.agda-cosmeticproblem':          { backgroundColor: '#404040' },
  '.agda-catchallclause':           { backgroundColor: '#404040' },
  '.agda-confluenceproblem':        { backgroundColor: '#800080' },
}

export const agdaDarkScheme = EditorView.theme(agdaDarkSchemeSpec, { dark: true })
