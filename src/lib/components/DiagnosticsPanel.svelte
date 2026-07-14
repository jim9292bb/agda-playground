<script>
import { diagnosticToAgdaUtf8Position, focusAgdaUtf8Position } from '$lib/agda/diagnostics'

/** @type {{
 * diagnostics: import('$lib/agda/diagnostics').AgdaDiagnostic[],
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * }} */
let { diagnostics, agdaController } = $props()

/** @param {import('$lib/agda/diagnostics').AgdaDiagnostic} diagnostic */
function formatDiagnosticLocation(diagnostic) {
  const start = `${diagnostic.filepath}:${diagnostic.line}.${diagnostic.column}`
  if (diagnostic.endLine == null || diagnostic.endColumn == null) return start
  if (diagnostic.endLine === diagnostic.line) return `${start}-${diagnostic.endColumn}`
  return `${start}-${diagnostic.endLine}.${diagnostic.endColumn}`
}

/** @param {import('$lib/agda/diagnostics').AgdaDiagnostic} diagnostic */
function canFocusDiagnostic(diagnostic) {
  return diagnostic.filepath === '/source.agda' &&
    Number.isFinite(diagnostic.line) &&
    Number.isFinite(diagnostic.column)
}

/** @param {import('$lib/agda/diagnostics').AgdaDiagnostic} diagnostic */
function focusDiagnostic(diagnostic) {
  const editorView = agdaController.editorView
  if (!editorView || !canFocusDiagnostic(diagnostic)) return
  const position = diagnosticToAgdaUtf8Position(editorView.state, diagnostic)
  focusAgdaUtf8Position(editorView, position)
}
</script>

<section class="diagnostics-panel" aria-label="Agda diagnostics">
  <header class="diagnostics-panel-title">Diagnostics</header>
  {#if diagnostics.length}
    <div class="diagnostics-list">
        {#each diagnostics as diagnostic (`${diagnostic.filepath}:${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`)}
          <button
            class:clickable={canFocusDiagnostic(diagnostic)}
            class:error={diagnostic.severity === 'error'}
            class:warning={diagnostic.severity === 'warning'}
            class="diagnostic-card"
            type="button"
            disabled={!canFocusDiagnostic(diagnostic)}
            aria-label={`Jump to ${formatDiagnosticLocation(diagnostic)}`}
            onclick={() => focusDiagnostic(diagnostic)}
          >
            <div class="diagnostic-meta">
              <strong>{diagnostic.severity}</strong>
              {#if diagnostic.code}
                <code>{diagnostic.code}</code>
              {/if}
            </div>
            <div class="diagnostic-location">{formatDiagnosticLocation(diagnostic)}</div>
            <pre>{diagnostic.message}</pre>
          </button>
        {/each}
    </div>
  {:else}
    <div class="diagnostics-empty">No diagnostics.</div>
  {/if}
</section>

<style>
.diagnostics-panel {
  display: grid;
  gap: 8px;
  width: 100%;
  min-height: 0;
  overflow: auto;
}

.diagnostics-panel-title {
  color: #374151;
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
}

.diagnostics-list {
  display: grid;
  gap: 8px;
}

.diagnostics-empty {
  color: #777;
  font-size: .8rem;
}

.diagnostic-card {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-left-width: 4px;
  border-radius: 6px;
  background: var(--quiet-neutral-fill-softer);
  color: inherit;
  text-align: left;
  appearance: none;
  font: inherit;
}

.diagnostic-card.error {
  border-left-color: #c2410c;
}

.diagnostic-card.warning {
  border-left-color: #ca8a04;
}

.diagnostic-card.clickable {
  cursor: pointer;
}

.diagnostic-card.clickable:hover,
.diagnostic-card.clickable:focus-visible {
  border-color: #777;
  border-left-color: currentColor;
  background: var(--quiet-neutral-fill);
  outline: none;
}

.diagnostic-card:disabled {
  opacity: 1;
}

.diagnostic-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: .76rem;
  text-transform: capitalize;
}

.diagnostic-meta code {
  color: #666;
  font-family: JuliaMono, monospace;
  font-size: .72rem;
  text-transform: none;
}

.diagnostic-location {
  color: #444;
  font-family: JuliaMono, monospace;
  font-size: .76rem;
}

.diagnostic-card pre {
  margin: 0;
  color: #374151;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: JuliaMono, monospace;
  font-size: .72rem;
}
</style>
