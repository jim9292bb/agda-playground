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
  // Holes: Emacs's `highlight` face, but not its darkolivegreen #556b2f
  // fill, on which most of the palette below is unreadable. A fill no lighter
  // than the editor keeps the hole's contents as legible as anywhere else,
  // and a ring in the light-background `highlight` color (darkseagreen2) marks
  // the hole. The problem overlays below follow the same rule.
  '.agda-hole': {
    backgroundColor: '#19200e',
    boxShadow: 'inset 0 0 0 1px #b4eeb4',
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

  // Agda's Emacs mode defaults: the dark-background faces of
  // `agda2-highlight.el` (agda/src/data/emacs-mode), and Emacs's own
  // `font-lock-comment-face` (chocolate1) for comments. Kept identical to
  // Emacs on purpose (strings and errors fall a little short of WCAG AA here)
  // with two exceptions, both because Emacs's own dark colors are close to
  // unreadable: numbers, and the hole and problem fills -- see
  // color-scheme.test.js.
  // definitions are from `Agda/Syntax/Common/Aspect.hs`
  // strings are from `toAtoms :: Aspects -> [String]`

  // -- aspects
  '.agda-comment':                  { color: '#ff7f24' },
  '.agda-keyword':                  { color: '#ff9932' },
  '.agda-string':                   { color: '#dd4d4d' },
  // Not Emacs's dark #9010e0 (2.4:1 here): the module purple, as numbers
  // and modules share purple on a light background in Emacs.
  '.agda-number':                   { color: '#cd80ff' },
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
  // Problem overlays: Emacs's dark fills (noted after each) are mid-tones that
  // hide nearly every text color, so each is darkened until text reads as
  // well as on the editor, and ringed in the light-background Emacs color.
  '.agda-error':                    { color: '#ff0000', textDecoration: 'underline' },
  '.agda-errorwarning':             { backgroundColor: '#3a1000', boxShadow: 'inset 0 0 0 1px #f08080', textDecoration: 'underline' },  // #802400
  // dottedpattern
  '.agda-unsolvedmeta':             { backgroundColor: '#231d00', boxShadow: 'inset 0 0 0 1px #ffff00' },  // #806b00
  '.agda-unsolvedconstraint':       { backgroundColor: '#231d00', boxShadow: 'inset 0 0 0 1px #ffff00' },  // #806b00
  '.agda-terminationproblem':       { backgroundColor: '#3a1000', boxShadow: 'inset 0 0 0 1px #ffa07a' },  // #802400
  '.agda-positivityproblem':        { backgroundColor: '#2f1700', boxShadow: 'inset 0 0 0 1px #cd853f' },  // #803f00
  '.agda-deadcode':                 { backgroundColor: '#1d1d1d', boxShadow: 'inset 0 0 0 1px #a9a9a9' },  // #808080
  '.agda-shadowingintelescope':     { backgroundColor: '#1d1d1d', boxShadow: 'inset 0 0 0 1px #a9a9a9' },  // #808080
  '.agda-coverageproblem':          { backgroundColor: '#2a1b00', boxShadow: 'inset 0 0 0 1px #f5deb3' },  // #805300
  // incompletepattern
  '.agda-typechecks':               { color: 'white', backgroundColor: '#006080' },
  '.agda-missingdefinition':        { backgroundColor: '#2e1717', boxShadow: 'inset 0 0 0 1px #ffa500' },  // #804040
  '.agda-instanceproblem':          { backgroundColor: '#2a1b00', boxShadow: 'inset 0 0 0 1px #f5deb3' },  // #805300
  '.agda-cosmeticproblem':          { backgroundColor: '#1d1d1d', boxShadow: 'inset 0 0 0 1px #f5f5f5' },  // #404040
  '.agda-catchallclause':           { backgroundColor: '#1d1d1d', boxShadow: 'inset 0 0 0 1px #f5f5f5' },  // #404040
  '.agda-confluenceproblem':        { backgroundColor: '#3c003c', boxShadow: 'inset 0 0 0 1px #ffc0cb' },  // #800080
}

export const agdaDarkScheme = EditorView.theme(agdaDarkSchemeSpec, { dark: true })
