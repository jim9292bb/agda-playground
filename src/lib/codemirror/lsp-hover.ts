import type * as lsp from "vscode-languageserver-protocol"
import {EditorView, type Tooltip, hoverTooltip} from "@codemirror/view"
import type {Extension} from "@codemirror/state"
import {language as languageFacet, highlightingFor} from "@codemirror/language"
import {highlightCode} from "@lezer/highlight"

// import {fromPosition} from "./pos"

import {Text} from "@codemirror/state"

export function fromPosition(doc: Text, pos: lsp.Position): number {
  const line = doc.line(pos.line + 1)
  return line.from + pos.character
}

// import {escHTML} from "./text"

export function escHTML(text: string) {
  return text.replace(/[\n<&]/g, ch => ch == "\n" ? "<br>" : ch == "<" ? "&lt;" : "&amp;")
}

import { type LSPClientConfig, LSPPlugin, type LSPClient } from '@codemirror/lsp-client'

interface LSPClientPriv extends LSPClient {
  hasCapability: (cap: string) => boolean
  config: LSPClientConfig
}

interface LSPPluginPriv extends LSPPlugin {
  client: LSPClientPriv
}

/// Create an extension that queries the language server for hover
/// tooltips when the user hovers over the code with their pointer,
/// and displays a tooltip when the server provides one.
export function hoverTooltips(config?: Parameters<typeof hoverTooltip>[1]): Extension {
  return hoverTooltip((view, pos, _side) => {
    const plugin = LSPPlugin.get(view)
    if (!plugin) return Promise.resolve(null)
    return lspTooltipSourceCore({
      plugin: plugin as LSPPluginPriv,
      doc: view.state.doc,
      toQueryPos: p => p,
      toResultPos: p => p,
    }, pos)
  }, config)
}

/// Same as `hoverTooltips()`, but for a CodeMirror view whose own document
/// isn't what Agda actually knows about -- the N-EditorView notebook routes
/// (`/literate`, `/plfa`) query the language server through a hidden
/// composite `EditorView` holding the one logical assembled document, while
/// the user hovers over one of N separate, visible per-cell EditorViews
/// (see `literate-cell-sync.js`'s module doc). `getMapping` is called fresh
/// on every hover (not once at extension-creation time) so it can read the
/// current cell offsets; it returns null if this cell can't currently be
/// mapped (e.g. it was just deleted).
export function hoverTooltipsForCell(
  getMapping: () => {
    hiddenView: EditorView,
    /** cell-local position -> hidden-document position, or null if out of range */
    toGlobal: (localPos: number) => number | null,
    /** hidden-document position -> cell-local position, or null if it falls outside this cell */
    toLocal: (globalPos: number) => number | null,
  } | null,
  config?: Parameters<typeof hoverTooltip>[1]
): Extension {
  return hoverTooltip((_view, pos, _side) => {
    const mapping = getMapping()
    if (!mapping) return Promise.resolve(null)
    const plugin = LSPPlugin.get(mapping.hiddenView)
    if (!plugin) return Promise.resolve(null)
    return lspTooltipSourceCore({
      plugin: plugin as LSPPluginPriv,
      doc: mapping.hiddenView.state.doc,
      toQueryPos: mapping.toGlobal,
      toResultPos: mapping.toLocal,
    }, pos)
  }, config)
}

function hoverRequest(plugin: LSPPluginPriv, pos: number) {
  if (plugin.client.hasCapability("hoverProvider") === false) return Promise.resolve(null)
  plugin.client.sync()
  return plugin.client.request<lsp.HoverParams, lsp.Hover | null>("textDocument/hover", {
    position: plugin.toPosition(pos),
    textDocument: {uri: plugin.uri},
  })
}

function hoverContentText(value: lsp.Hover['contents']): string {
  if (Array.isArray(value)) return value.map(v => typeof v === 'string' ? v : v.value).join('\n')
  if (typeof value === 'string') return value
  return value.value
}

function isAgdaInternalError(result: lsp.Hover | null) {
  if (!result) return false
  const text = hoverContentText(result.contents)
  return text.includes('An internal error has occurred') ||
    text.includes('__IMPOSSIBLE_VERBOSE__')
}

interface HoverPositionMapping {
  plugin: LSPPluginPriv
  /** the document the LSP plugin's own view holds -- what `result.range`
   *  (an LSP position) is relative to, NOT necessarily the hovered view's
   *  own document (see `hoverTooltipsForCell`) */
  doc: Text
  /** hovered-view-local position -> the position to actually query Agda
   *  with (identity for a plain single-view hover; cell-local -> hidden
   *  composite document for `hoverTooltipsForCell`) */
  toQueryPos: (localPos: number) => number | null
  /** the reverse of `toQueryPos`, applied to `result.range`'s endpoints so
   *  the tooltip is anchored at the right position in the hovered view */
  toResultPos: (queryPos: number) => number | null
}

function lspTooltipSourceCore(mapping: HoverPositionMapping, localPos: number): Promise<Tooltip | null> {
  const { plugin, doc, toQueryPos, toResultPos } = mapping
  const queryPos = toQueryPos(localPos)
  if (queryPos == null) return Promise.resolve(null)

  // add a soft timeout to show a loading message before the info loads
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(resolve, 300)
  })

  // TODO: allow to skip the request if the cursor is not at an identifier

  const hoverPromise = hoverRequest(plugin, queryPos)
    .then(result => isAgdaInternalError(result) ? null : result)
    .catch(error => {
      console.warn('Agda hover request failed', error)
      return null
    })

  // Maps one endpoint of `result.range` (an LSP position in `doc`'s
  // coordinates) back to the hovered view's local coordinates, falling back
  // to `localPos` if there's no range or the mapping fails (e.g. Agda's
  // range briefly straddles a cell boundary mid-edit).
  const resolveRangeEndpoint = (position: lsp.Position | undefined) =>
    position ? (toResultPos(fromPosition(doc, position)) ?? localPos) : localPos

  return Promise.race([
    timeoutPromise.then(() => true),
    hoverPromise.then(() => false),
  ]).then<Tooltip | null>((timedOut) => {
    if (timedOut) {
      const dummyTooltip = {
        // XXX: these values are updated after the hover promise is resolved
        pos: localPos, end: localPos,
        create() {
          const elt = document.createElement("div")
          elt.className = "cm-lsp-hover-tooltip cm-lsp-documentation cm-lsp-hover-tooltip--loading"
          elt.innerHTML = "Loading..."

          hoverPromise.then(result => {
            elt.classList.remove("cm-lsp-hover-tooltip--loading")
            if (result) {
              dummyTooltip.pos = resolveRangeEndpoint(result.range?.start)
              dummyTooltip.end = resolveRangeEndpoint(result.range?.end)

              elt.innerHTML = renderTooltipContent(plugin, result.contents)
            } else {
              // should remove?
              elt.innerHTML = ''
            }
          })

          return {dom: elt}
        },
      }

      return dummyTooltip
    } else {
      clearTimeout(timer)
      return hoverPromise.then(result => {
        if (!result) return null
        return {
          pos: resolveRangeEndpoint(result.range?.start),
          end: resolveRangeEndpoint(result.range?.end),
          create() {
            const elt = document.createElement("div")
            elt.className = "cm-lsp-hover-tooltip cm-lsp-documentation"
            elt.innerHTML = renderTooltipContent(plugin, result.contents)
            return {dom: elt}
          },
          // above: true
        }
      })
    }
  })
}

function renderTooltipContent(
  plugin: LSPPluginPriv,
  value: string | lsp.MarkupContent | lsp.MarkedString | lsp.MarkedString[]
) {
  if (Array.isArray(value)) return value.map(m => renderCode(plugin, m)).join("<br>")
  if (typeof value == "string" || typeof value == "object" && "language" in value) return renderCode(plugin, value)
  return plugin.docToHTML(value)
}

function renderCode(plugin: LSPPluginPriv, code: lsp.MarkedString) {
  if (typeof code == "string") return plugin.docToHTML(code, "markdown")
  const {language, value} = code
  let lang = plugin.client.config.highlightLanguage && plugin.client.config.highlightLanguage(language || "")
  if (!lang) {
    const viewLang = plugin.view.state.facet(languageFacet)
    if (viewLang && (!language || viewLang.name == language)) lang = viewLang
  }
  if (!lang) return escHTML(value)
  let result = ""
  highlightCode(value, lang.parser.parse(value), {style: tags => highlightingFor(plugin.view.state, tags)}, (text, cls) => {
    result += cls ? `<span class="${cls}">${escHTML(text)}</span>` : escHTML(text)
  }, () => {
    result += "<br>"
  })
  return result
}
