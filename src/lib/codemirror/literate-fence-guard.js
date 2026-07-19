import { EditorState, Annotation } from '@codemirror/state'
import { isFenceLine } from '$lib/agda/literate-blocks'

/**
 * Tag a dispatch with this annotation to bypass the fence-line guard --
 * used by the literate route's own block-insert/delete/import actions,
 * which are exactly the sanctioned way to create or remove fence lines.
 * @type {import('@codemirror/state').AnnotationType<boolean>}
 */
export const blockStructureEdit = Annotation.define()

/**
 * @param {import('@codemirror/state').Text} doc
 * @param {number} from
 * @param {number} to
 */
function rangeTouchesFenceLine(doc, from, to) {
  const clampedFrom = Math.max(0, Math.min(from, doc.length))
  const clampedTo = Math.max(0, Math.min(to, doc.length))
  const startLine = doc.lineAt(clampedFrom).number
  const endLine = doc.lineAt(Math.max(clampedFrom, clampedTo - 1)).number
  for (let ln = startLine; ln <= endLine; ln++) {
    if (isFenceLine(doc.line(ln).text)) return true
  }
  return false
}

/**
 * Blocks any document edit that would create, remove, or otherwise modify
 * a ```agda / ``` fence line, unless the transaction carries
 * blockStructureEdit -- makes block creation/deletion only possible
 * through the literate route's own toolbar (and import), never by typing
 * or pasting fence syntax directly. Content edits *inside* an existing
 * block (including Give/Refine/case-split's programmatic edits, which
 * never touch fence lines themselves) are completely unaffected.
 * @type {import('@codemirror/state').Extension}
 */
export const literateFenceGuard = EditorState.changeFilter.of(tr => {
  if (!tr.docChanged) return true
  if (tr.annotation(blockStructureEdit)) return true
  // Test-only escape hatch: browser tests dispatch fixture-loading
  // transactions directly via view.dispatch() (scripts/browser-common.sh's
  // set_editor_fixture), bypassing the app's own annotated entry points
  // (import, example picker). Never true in a real user session.
  if (typeof window !== 'undefined' && /** @type {any} */ (window).__agdaTestBypassFenceGuard) return true

  let allowed = true
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (!allowed) return
    if (rangeTouchesFenceLine(tr.startState.doc, fromA, toA)) { allowed = false; return }
    if (rangeTouchesFenceLine(tr.newDoc, fromB, toB)) { allowed = false; return }
  })
  return allowed
})
