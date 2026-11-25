import { Compartment, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { appearance, onAppearanceChange } from '$lib/appearance.svelte'

// TODO: split baseTheme with (the real) theme
const myBaseTheme = EditorView.baseTheme({
  '&': {
    border: '0 none',
    fontSize: '14px',
    '&.cm-focused': {
      outline: '0 none',
      // outlineOffset: '1px',
    },
  },
  '&.cm-editor': {
    borderRadius: '0',
    height: '100%',
    width: '100%',
  },
  '.cm-content, .cm-lineNumbers, .cm-gutterElement': {
    fontFamily: 'JuliaMono, monospace',
    // seems that more people love half-width arrows...
    // fontFeatureSettings: '"calt" off, "NWID" on',
  },
  '&dark .cm-activeLine': {
    backgroundColor: '#66666620',
  },
  '&dark .cm-activeLineGutter': {
    background: '#66666620',
  },
  '.cm-selectionMatch.cm-selectionMatch': {
    // FIXME
    backgroundColor: 'transparent',
    outline: '1px solid #AAAAAAC0',
    borderRadius: '2px',
  },
  '&dark .cm-selectionMatch.cm-selectionMatch': {
    outlineColor: '#666666C0',
  },

  '&dark .cm-cursor': {
    borderLeftColor: '#bbb',
    borderLeftWidth: '2px',
  },
  '&dark .cm-foldPlaceholder.cm-foldPlaceholder': {
    // FIXME
    backgroundColor: '#333',
    borderColor: '#444',
  },

  '.cm-tooltip-section': {
    padding: '4px',
    marginTop: '4px',
    marginBottom: '0',
  },
  '&dark .cm-tooltip-section': {
    borderTop: '1px solid #777',
  },

  '&dark .cm-tooltip.cm-tooltip.cm-tooltip-hover': {
    borderColor: '#111',
  },

  '.cm-tooltip-section:first-child': {
    marginTop: '0',
    borderTop: 'none',
  },

  '.cm-tooltip.cm-tooltip-above': {
    marginBottom: '7px',
  },

  // helpers
  '.cm-agda-marks.hovered-keyword': {
    borderRadius: '2px',
    outline: '1px solid #000000c0',
  },
  '&dark .cm-agda-marks.hovered-keyword': {
    outlineColor: '#ffffffc0',
  },
})

/**
 * Switches an editor between light and dark along with the app's appearance
 * (Settings > Appearance, or the OS while that's set to follow the system;
 * see src/lib/appearance.svelte.js). `EditorView.darkTheme` makes
 * CodeMirror's own `&dark` base-theme variants apply -- both its built-in
 * ones and those in myBaseTheme above -- and `dark` / `light` swap in the
 * matching Agda highlighting palette. The page around the editor follows
 * through CSS on its own (theme.css).
 */
export function autoColorScheme(options: { dark?: Extension, light?: Extension } = {}): Extension {
  const { dark: darkExt = [], light: lightExt = [] } = options
  const compartment = new Compartment()
  const schemeExt = (dark: boolean): Extension => [EditorView.darkTheme.of(dark), dark ? darkExt : lightExt]
  const initialDark = appearance.isDark()

  const plugin = ViewPlugin.define(view => {
    let current = initialDark
    const unsubscribe = onAppearanceChange(dark => {
      if (dark === current) return
      current = dark
      view.dispatch({ effects: compartment.reconfigure(schemeExt(dark)) })
    })
    return { destroy: unsubscribe }
  })

  return [plugin, compartment.of(schemeExt(initialDark))]
}

export function myCodeMirrorTheme(): Extension {
  return [
    myBaseTheme,
    EditorView.theme({
      // The gutter shares the header's "chrome" gray, in both schemes.
      '.cm-gutters': {
        backgroundColor: 'var(--app-chrome)',
        color: 'var(--app-text-muted)',
        borderRight: '1px solid var(--app-border)',
      },
      '.cm-tooltip': {
        overflow: 'auto',
        zIndex: 500,  // must be > 300 (.cm-panels)
      },
      '.cm-tooltip.cm-tooltip-hover': {
        borderRadius: '2px',
        border: '1px solid #4c4b51',
      },
    }),
  ]
}
