<script>
import { untrack } from 'svelte'
import QueriesPanel from './QueriesPanel.svelte'
import DiagnosticsPanel from './DiagnosticsPanel.svelte'

/** @type {{
 * position: 'bottom' | 'right',
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * textboxContent: string,
 * agdaDiagnostics: import('$lib/agda/diagnostics').AgdaDiagnostic[],
 * selectedMessageTab: 'log' | 'queries' | 'errors',
 * }} */
let {
  position,
  agdaController,
  textboxContent,
  agdaDiagnostics,
  selectedMessageTab = $bindable(),
} = $props()

let logEntries = $derived(textboxContent.trimEnd().split(/\n+/).filter(Boolean))

/** @type {HTMLDivElement | undefined} */
let textbox = $state(undefined)
/** @type {number | undefined} */
let raf
let needScroll = false

$effect.pre(() => {
  textboxContent
  if (textbox && textbox.scrollHeight - textbox.clientHeight - textbox.scrollTop < 50) {
    needScroll = true
  }
})

$effect(() => {
  textboxContent
  untrack(() => raf)
  if (needScroll && !raf) {
    raf = requestAnimationFrame(() => {
      if (textbox) textbox.scrollTop = textbox.scrollHeight
      raf = undefined
      needScroll = false
    })
  }
})
</script>

<section
  class="messages-panel"
  class:messages-right={position === 'right'}
  data-log-content={textboxContent}
  data-performance-entries={JSON.stringify(agdaController.performanceEntries)}
  data-query-results={agdaController.queryResults.map(r => r.content).join('\n---\n')}
  aria-label="Messages">
  <header class="messages-header">
    <div class="messages-header-info">
      <strong>Messages</strong>
      <span>{selectedMessageTab === 'log' ? 'Agda interaction log' : selectedMessageTab === 'queries' ? `${agdaController.queryResults.length} results` : `${agdaDiagnostics.length} diagnostics`}</span>
    </div>
    <div class="messages-tab-group" role="group" aria-label="Message view">
      <button type="button" class="messages-tab" class:active={selectedMessageTab === 'log'}
        onclick={() => { selectedMessageTab = 'log' }}>Log</button>
      <button type="button" class="messages-tab" class:active={selectedMessageTab === 'queries'}
        onclick={() => { selectedMessageTab = 'queries' }}>Queries{agdaController.queryResults.length ? ` (${agdaController.queryResults.length})` : ''}</button>
      <button type="button" class="messages-tab" class:active={selectedMessageTab === 'errors'}
        onclick={() => { selectedMessageTab = 'errors' }}>Errors{agdaDiagnostics.length ? ` (${agdaDiagnostics.length})` : ''}</button>
    </div>
  </header>

  <div class="messages-body">
    {#if selectedMessageTab === 'log'}
      <div bind:this={textbox} class="messages-log" aria-label="Agda log" role="log">
        {#if logEntries.length}
          {#each logEntries as entry}
            <pre class="messages-log-entry">{entry}</pre>
          {/each}
        {:else}
          <div class="messages-log-empty">(log area is empty)</div>
        {/if}
      </div>
    {:else if selectedMessageTab === 'queries'}
      <QueriesPanel {agdaController} />
    {:else}
      <DiagnosticsPanel diagnostics={agdaDiagnostics} {agdaController} />
    {/if}
  </div>
</section>

<style>
.messages-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--quiet-neutral-fill);
}

/* Goals docked to 'right': Messages is a fixed-size (4.5 of the 5.5:4.5
   split with Goals), flat outlined box — plain border, square corners,
   no shadow — instead of the 'bottom' position's rounded/shadowed card. */
.messages-panel.messages-right {
  flex: 4.5 4.5 0;
  min-height: 0;
  margin: 0;
  border: 1px solid #e6e9ee;
  overflow: hidden;
}

.messages-panel.messages-right .messages-header {
  background: #ffffff;
  border-bottom-width: 2px;
  border-bottom-color: #e6e9ee;
}

/* Goals docked to 'bottom': Messages is alone in the right column and
   needs to read as its own panel against the page background —
   margin-top compensates for .output-section's own -1px margin-top
   (which overlaps the SplitPane divider above it, in +page.svelte)
   — without this, that -1px shift clips off the top pixel of this
   card's own border. */
.messages-panel:not(.messages-right) {
  margin: 1px 12px 12px 12px;
  border-radius: 10px;
  border: 1px solid #d0d2d8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.messages-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 8px;
  background: var(--quiet-neutral-fill-softer);
  border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
}

.messages-header-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.messages-header strong {
  font-size: .9rem;
  font-weight: 500;
  letter-spacing: .02em;
  text-transform: uppercase;
}

.messages-header span {
  color: #666;
  font-size: .72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.messages-tab-group {
  display: flex;
  gap: 1px;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 5px;
  background: var(--quiet-neutral-stroke-softer);
  overflow: hidden;
  flex-shrink: 0;
}

.messages-tab {
  border: none;
  background: var(--quiet-neutral-fill-softer);
  color: #374151;
  font: inherit;
  font-size: .72rem;
  padding: 3px 9px;
  cursor: pointer;
  white-space: nowrap;
}

.messages-tab.active {
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text, #3b3aab);
  font-weight: 500;
}

.messages-tab:hover:not(.active) {
  background: color-mix(in srgb, var(--quiet-neutral-stroke-softer) 60%, var(--quiet-neutral-fill-softer));
}

.messages-body {
  display: flex;
  flex: 1 1;
  min-height: 0;
  padding: 0;
}

.messages-log {
  flex: 1 1;
  min-height: 0;
  width: 100%;
  overflow: auto;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 6px;
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 78%, white);
}

.messages-log-entry {
  margin: 0;
  padding: 7px 8px;
  color: #444;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: JuliaMono, monospace;
  font-size: 11px;
  line-height: 1.45;
}

.messages-log-entry + .messages-log-entry {
  border-top: 1px solid var(--quiet-neutral-stroke-softer);
}

.messages-log-empty {
  padding: 8px;
  color: #777;
  font-size: .8rem;
}
</style>
