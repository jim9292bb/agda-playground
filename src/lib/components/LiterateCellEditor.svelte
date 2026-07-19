<script>
import { untrack } from 'svelte'
import { EditorView } from '@codemirror/view'

/**
 * Mounts one literate-programming cell's own visible CodeMirror EditorView.
 * Deliberately its own component (not an inline `{@attach}` inside the
 * parent's `{#each cells as cell (cell.id)}` block): an inline attachment
 * factory re-evaluates on every structural change to the `cells` array
 * (confirmed empirically -- inserting one new cell caused an *unrelated*
 * existing cell's EditorView to tear down and remount, discarding
 * unsynced edits).
 *
 * Just isolating the attachment into its own component wasn't enough on
 * its own, either -- passing `initialText={cell.text}` as a *reactive*
 * prop meant every local edit (which writes `cell.text` back, see
 * cellSyncExtensions) fed straight back in as a changed prop, and that
 * alone was enough to retrigger the attachment again (confirmed
 * empirically). `getText` is a function invoked exactly once, at actual
 * mount time, specifically so no later mutation of the underlying cell
 * text is ever read reactively by this component at all.
 *
 * @typedef Props
 * @prop {() => string} getText returns the cell's current text; called
 *   exactly once, at mount, for the EditorView's initial content only
 * @prop {import('@codemirror/state').Extension[]} extensions
 * @prop {(view: EditorView) => void} onView called once, right after the
 *   EditorView is constructed
 * @prop {() => void} [onDestroyed] called right before the view is
 *   destroyed
 */

/** @type {Props} */
let { getText, extensions, onView, onDestroyed } = $props()

/** @type {import('svelte/attachments').Attachment} */
function mount(el) {
  // Svelte's {@attach} tracks reactive reads transitively through whatever
  // this function calls, not just its own top-level expression -- reading
  // any $props() value in here (even indirectly, e.g. via getText()) would
  // otherwise make the *whole attachment* rerun on every later change to
  // that prop. Nothing in here is meant to be reactive: it's a one-time
  // snapshot read for the EditorView's initial construction, after which
  // CodeMirror's own state takes over completely.
  return untrack(() => {
    const view = new EditorView({
      doc: getText(),
      parent: el,
      extensions,
    })
    onView(view)

    return () => {
      onDestroyed?.()
      view.destroy()
    }
  })
}
</script>

<div class="literate-cell-editor" {@attach mount}></div>

<style>
.literate-cell-editor :global(.cm-editor) {
  background: transparent;
}
</style>
