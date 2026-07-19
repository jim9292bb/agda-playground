#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Must be set before sourcing browser-common.sh (see browser-test-literate-basic.sh).
APP_URL="${APP_URL:-http://127.0.0.1:8099/literate}"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

open_app
ab eval "localStorage.removeItem('agda-playground-literate.shortcut-overrides.v1'); localStorage.removeItem('agda-web-ide-beta:doc:source.lagda.md'); location.reload()"
ab wait --load networkidle

start_als

# Edit mode is now explicit and button-driven, not derived from cursor
# position -- on a fresh load nothing is being edited, so every non-empty
# markdown block renders as a preview widget immediately, including the
# leading one (even though the cursor starts at position 0, inside it).
ab eval "(() => {
  const widget = document.querySelector('.cm-markdown-preview')
  if (!widget) throw new Error('Expected the leading markdown block to render as a preview widget on load')
  if (!widget.querySelector('h1')) throw new Error('Expected the rendered heading: ' + widget.innerHTML)
  return { ok: true, html: widget.innerHTML }
})()"
echo "PASS leading markdown block renders as a preview widget immediately on load, even though the cursor starts inside it"

# The block's fence lines must never be visible as text -- the whole point
# of the redesign is a clean, GitHub-README-like render. Fence lines stay as
# real (still-present) .cm-line elements, visually collapsed via CSS, rather
# than being removed from the DOM outright (see literate-block-borders.js's
# module doc for why) -- check actual rendered size, not DOM presence.
ab eval "(() => {
  const fenceLines = Array.from(document.querySelectorAll('.cm-line')).filter(l => {
    const t = l.textContent.trim()
    return t === '\`\`\`agda' || t === '\`\`\`'
  })
  if (fenceLines.length !== 2) throw new Error('Expected exactly 2 fence lines in the DOM (collapsed, not removed), found ' + fenceLines.length)
  const visible = fenceLines.filter(l => l.getBoundingClientRect().height > 0)
  if (visible.length !== 0) throw new Error('Found ' + visible.length + ' fence line(s) still taking up visible space')
  return { ok: true }
})()"
echo "PASS code block fence lines are collapsed to zero height, not shown as visible text"

# Regression check for a real bug: every content line of a code block must
# get its box styling (background/border), including the very first line --
# a CodeMirror quirk where a Decoration.line() class silently failed to
# attach to the line immediately after a block-level widget/replace
# decoration caused the first content line specifically to render with no
# box at all (confirmed via a real screenshot before the fix).
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  const optionsPos = doc.indexOf('OPTIONS')
  const importPos = doc.indexOf('open import')
  const findLineEl = pos => {
    let node = view.domAtPos(pos).node
    while (node && node.nodeType === 3) node = node.parentNode
    while (node && !node.classList?.contains('cm-line')) node = node.parentElement
    return node
  }
  const optionsLine = findLineEl(optionsPos)
  const importLine = findLineEl(importPos)
  if (!optionsLine?.classList.contains('cm-literate-block-code')) {
    throw new Error('First content line of the code block is missing its box styling: ' + optionsLine?.className)
  }
  if (!importLine?.classList.contains('cm-literate-block-code')) {
    throw new Error('Last content line of the code block is missing its box styling: ' + importLine?.className)
  }
  return { ok: true, optionsClass: optionsLine.className, importClass: importLine.className }
})()"
echo "PASS every content line of the code block, including the first, gets its box styling"

# Clicking the Edit button (not the rendered text) enters edit mode.
ab eval "(() => {
  const widget = document.querySelector('.cm-markdown-preview')
  const btn = widget.querySelector('.cm-markdown-edit-button')
  if (!btn) throw new Error('Expected an Edit button on the rendered widget')
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  return { ok: true }
})()"

ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const widgets = document.querySelectorAll('.cm-markdown-preview').length
  const editor = document.querySelector('.cm-content')
  if (widgets !== 0) throw new Error('Expected the block to become editable (no widgets), found ' + widgets)
  if (view.state.selection.main.head !== 0) throw new Error('Expected the cursor at the start of the block, got ' + view.state.selection.main.head)
  if (!editor.contains(document.activeElement)) throw new Error('Editor is not focused after clicking Edit')
  if (!document.querySelector('.cm-markdown-done-button')) throw new Error('Expected a Done button while editing')
  return { ok: true, cursor: view.state.selection.main.head }
})()"
echo "PASS clicking Edit makes the block editable, places the cursor at its start, and shows a Done button"

# Clicking Done re-renders the block.
ab eval "(() => {
  const btn = document.querySelector('.cm-markdown-done-button')
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  const widgets = document.querySelectorAll('.cm-markdown-preview').length
  if (widgets !== 1) throw new Error('Expected the block to re-render after Done, found ' + widgets + ' widget(s)')
  return { ok: true }
})()"
echo "PASS clicking Done re-renders the block"

# Re-enter edit mode, then blur the editor entirely (e.g. clicking a panel
# elsewhere on the page) -- must also exit edit mode and re-render.
ab eval "(() => {
  document.querySelector('.cm-markdown-preview .cm-markdown-edit-button').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  const widgets = document.querySelectorAll('.cm-markdown-preview').length
  if (widgets !== 0) throw new Error('Expected edit mode to be active before the blur check')
  return { ok: true }
})()"
ab eval "(() => {
  document.querySelector('.cm-content').blur()
  return { ok: true }
})()"
ab eval "(() => {
  const widgets = document.querySelectorAll('.cm-markdown-preview').length
  if (widgets !== 1) throw new Error('Expected blurring the editor to exit edit mode and re-render, found ' + widgets + ' widget(s)')
  return { ok: true }
})()"
echo "PASS blurring the editor (focus leaving it entirely) exits edit mode"

# Only one markdown block can be in edit mode at a time: add a second
# markdown block via the toolbar (which auto-enters edit mode for it), and
# confirm the original leading block stays rendered, not also editable.
# Inserting right after *another markdown block* would just merge into it
# (no fence separates adjacent markdown text) -- put the cursor inside the
# code block first so the new block gets real fence boundaries of its own.
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const doc = view.state.doc.toString()
  view.dispatch({ selection: { anchor: doc.indexOf('OPTIONS') } })
  return { ok: true }
})()"
ab eval "(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ Markdown')
  if (!btn) throw new Error('+ Markdown button not found')
  btn.click()
  return { ok: true }
})()"
ab eval "(() => {
  const editing = document.querySelectorAll('.cm-markdown-done-button').length
  const rendered = document.querySelectorAll('.cm-markdown-preview').length
  if (editing !== 1) throw new Error('Expected exactly one block in edit mode after inserting, found ' + editing)
  if (rendered !== 1) throw new Error('Expected the original leading block to still be rendered, found ' + rendered + ' widget(s)')
  return { ok: true }
})()"
echo "PASS inserting a new markdown block auto-enters edit mode for only that block, leaving other markdown blocks rendered"

# Arrow-key navigation must skip clean over a rendered markdown block --
# never land the cursor inside one. Exit edit mode on the new block first,
# put the cursor at the very end of the document, then walk left with real
# ArrowLeft key events (exercising the atomicRanges facet, not a manual
# selection set) and confirm the cursor never stops inside either markdown
# block's own text range.
ab eval "(() => {
  document.querySelector('.cm-markdown-done-button').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  return { ok: true }
})()"
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  view.focus()
  return { ok: true }
})()"
ab eval "(() => {
  const editor = document.querySelector('.cm-content')
  for (let i = 0; i < 300; i++) {
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true }))
  }
  return { ok: true }
})()"
ab eval "(() => {
  const view = document.querySelector('.cm-content')?.cmTile?.view
  const head = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const lines = doc.split('\n')
  const codeRegions = []
  let offset = 0
  let inCode = false
  let regionStart = 0
  for (const line of lines) {
    if (!inCode && /^\`\`\`agda\s*\$/.test(line)) { inCode = true; regionStart = offset }
    else if (inCode && /^\`\`\`\s*\$/.test(line)) { inCode = false; codeRegions.push([regionStart, offset + line.length]) }
    offset += line.length + 1
  }
  const insideOrAtCodeRegion = codeRegions.some(([from, to]) => head >= from && head <= to)
  const atDocBoundary = head === 0 || head === doc.length
  if (!insideOrAtCodeRegion && !atDocBoundary) {
    throw new Error('Cursor landed inside a rendered markdown block at position ' + head + '; code regions: ' + JSON.stringify(codeRegions))
  }
  return { ok: true, head, codeRegions }
})()"
echo "PASS arrow-key navigation from the end of the document skips over rendered markdown blocks, landing only in a code region or at a document boundary"

echo "browser-test-literate-preview: PASS"
