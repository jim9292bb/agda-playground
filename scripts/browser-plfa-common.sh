#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Must be set before sourcing browser-common.sh: it does
# APP_URL="${APP_URL:-http://127.0.0.1:8099/}" at its own top level, so
# setting this after sourcing would be a no-op.
APP_URL="${APP_URL:-http://127.0.0.1:8099/plfa}"

# shellcheck source=scripts/browser-common.sh
source "$SCRIPT_DIR/browser-common.sh"

# /plfa reuses /literate's N-EditorView cell engine and the exact same
# `.literate-cell`/`.literate-cell-editor`/`.literate-cell-delete-btn` DOM
# classes (LiterateCellEditor.svelte is shared) -- most helpers here are the
# same cell-index-aware pattern as browser-literate-common.sh. What's
# different: there's no fixed default document -- the landing page is just
# an intro cell until a chapter is picked from the "Chapters" dropdown
# (see select_plfa_chapter), and Agda's own file path/localStorage key is
# `source-plfa.lagda.md`, not `source.lagda.md`.

plfa_open_app() {
  ab open "$APP_URL"
  ab wait --load networkidle
  # /plfa uses its own localStorage namespace (AgdaController's
  # sourceFileName: 'source-plfa.lagda.md') so it doesn't share state with
  # the default route or /literate.
  ab eval "localStorage.removeItem('agda-playground-plfa.shortcut-overrides.v1'); localStorage.removeItem('agda-web-ide-beta:doc:source-plfa.lagda.md'); location.reload()"
  ab wait --load networkidle
}

# Opens the "Chapters" dropdown and clicks the entry whose label *starts
# with* `label_prefix` (labels are "<Title>: <description>", e.g.
# "Naturals: Natural numbers" -- matching on the title alone is enough and
# doesn't require typing out each chapter's full blurb).
select_plfa_chapter() {
  local prefix_json
  prefix_json="$(json_string "$1")"
  ab eval "(() => {
    const prefix = $prefix_json
    const openBtn = document.querySelector('.header-examples-btn')
    if (!openBtn) return { ok: false, error: 'Chapters button not found' }
    openBtn.click()
    return { ok: true }
  })()"
  ab wait 400 >/dev/null
  ab eval "(() => {
    const prefix = $prefix_json
    const items = Array.from(document.querySelectorAll('.header-examples-item'))
    const item = items.find(b => b.textContent.trim().startsWith(prefix))
    if (!item) return { ok: false, error: 'chapter not found: ' + prefix, available: items.map(b => b.textContent.trim()) }
    item.click()
    return { ok: true, prefix }
  })()"
  ab wait --load networkidle
}

cell_count() {
  ab eval "(() => document.querySelectorAll('.literate-cell').length)()"
}

editor_cell_count() {
  ab eval "(() => document.querySelectorAll('.literate-cell-editor .cm-content').length)()"
}

# Replaces cell `index`'s own content (plain text, never fence-wrapped --
# a cell's text never contains fence syntax in this architecture).
set_cell_content() {
  local index content_json
  index="$1"
  content_json="$(json_string "$2")"
  ab eval "(() => {
    const index = Number($index)
    const content = $content_json
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    const el = cells[index]
    if (!el) return { ok: false, error: 'cell not found', index, count: cells.length }
    const view = el.cmTile.view
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
    view.focus()
    return { ok: true, text: view.state.doc.toString() }
  })()"
}

# Appends text to the end of cell `index`'s own content -- used to add a
# throwaway goal to a real PLFA chapter cell without having to reproduce
# that chapter's own (often long) content as a hand-typed fixture.
append_cell_content() {
  local index content_json
  index="$1"
  content_json="$(json_string "$2")"
  ab eval "(() => {
    const index = Number($index)
    const content = $content_json
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    const el = cells[index]
    if (!el) return { ok: false, error: 'cell not found', index, count: cells.length }
    const view = el.cmTile.view
    view.dispatch({ changes: { from: view.state.doc.length, insert: content } })
    view.focus()
    return { ok: true, text: view.state.doc.toString() }
  })()"
}

cell_text() {
  local index
  index="$1"
  ab eval "(() => {
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    return cells[Number($index)]?.cmTile?.view?.state.doc.toString() ?? ''
  })()"
}

# Places the cursor just inside the `holeIndex`-th `{! !}` goal within cell
# `index`'s own local text, and focuses that cell.
cursor_in_cell_goal() {
  local index hole_index
  index="$1"
  hole_index="${2:-0}"
  ab eval "(() => {
    const index = Number($index)
    const holeIndex = Number($hole_index)
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    const el = cells[index]
    if (!el) return { ok: false, error: 'cell not found', index, count: cells.length }
    const view = el.cmTile.view
    const doc = view.state.doc.toString()
    const holes = []
    let searchFrom = 0
    while (searchFrom < doc.length) {
      const from = doc.indexOf('{!', searchFrom)
      if (from < 0) break
      const close = doc.indexOf('!}', from + 2)
      if (close < 0) break
      holes.push({ from, close })
      searchFrom = close + 2
    }
    const hole = holes[holeIndex]
    if (!hole) return { ok: false, error: 'hole not found', holeIndex, holes: holes.length }
    view.dispatch({ selection: { anchor: Math.max(hole.from + 3, hole.close) } })
    view.focus()
    return { ok: true, cursor: view.state.selection.main.head }
  })()"
}

# Dispatches an Agda chord (e.g. "l"/"KeyL" for Load, "a"/"KeyA" for Auto)
# directly on cell `index`'s own DOM element -- unlike browser-common.sh's
# press_agda_chord, which always targets the *first* `.cm-content` on the
# page (wrong once more than one cell is mounted).
press_agda_chord_in_cell() {
  local index key code
  index="$1"
  key="$2"
  code="${3:-Key${key^^}}"
  ab eval "(() => {
    const index = Number($index)
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    const el = cells[index]
    if (!el) return { ok: false, error: 'cell not found', index, count: cells.length }
    const view = el.cmTile.view
    view.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true, cancelable: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '$key', code: '$code', ctrlKey: true, bubbles: true, cancelable: true }))
    return { ok: true, key: '$key', code: '$code' }
  })()"
}

click_toolbar_button() {
  local label_json
  label_json="$(json_string "$1")"
  ab eval "(() => {
    const label = $label_json
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === label)
    if (!btn) throw new Error('button not found: ' + label)
    btn.click()
    return { ok: true, label }
  })()"
}

assert_cell_contains() {
  local index needle_json label
  index="$1"
  needle_json="$(json_string "$2")"
  label="${3:-$2}"
  ab eval "(() => {
    const index = Number($index)
    const needle = $needle_json
    const cells = document.querySelectorAll('.literate-cell-editor .cm-content')
    const text = cells[index]?.cmTile?.view?.state.doc.toString() ?? ''
    if (!text.includes(needle)) throw new Error('Cell ' + index + ' does not contain: ' + needle + '\\ngot: ' + text)
    return { ok: true, contains: needle }
  })()"
  echo "PASS cell $index contains: $label"
}

assert_cell_count() {
  local expected label
  expected="$1"
  label="${2:-$expected cells}"
  local actual
  actual="$(cell_count)"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $expected cells, found $actual" >&2
    return 1
  fi
  echo "PASS cell count: $label"
}
