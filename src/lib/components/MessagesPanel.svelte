<script>
import { untrack } from 'svelte'
import QueriesPanel from './QueriesPanel.svelte'
import DiagnosticsPanel from './DiagnosticsPanel.svelte'

/** @type {{
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * textboxContent: string,
 * agdaDiagnostics: import('$lib/agda/diagnostics').AgdaDiagnostic[],
 * selectedMessageTab: 'log' | 'queries' | 'errors',
 * showHeading?: boolean,
 * }} */
let {
  agdaController,
  textboxContent,
  agdaDiagnostics,
  selectedMessageTab = $bindable(),
  showHeading = true,
} = $props()

let logEntries = $derived(textboxContent.trimEnd().split(/\n+/).filter(Boolean))

const tabs = $derived([
  { id: /** @type {const} */ ('log'), label: 'Log', count: 0 },
  { id: /** @type {const} */ ('queries'), label: 'Queries', count: agdaController.queryResults.length },
  { id: /** @type {const} */ ('errors'), label: 'Errors', count: agdaDiagnostics.length },
])

let copied = $state(false)
/** @type {ReturnType<typeof setTimeout> | undefined} */
let copiedTimer

/** Copies what the current tab shows, as plain text. */
function copyCurrentTab() {
  const text = selectedMessageTab === 'log'
    ? textboxContent.trimEnd()
    : selectedMessageTab === 'queries'
      ? agdaController.queryResults.map(r => `${r.label}\n${r.content}`).join('\n\n')
      : agdaDiagnostics.map(d => `${d.filepath}:${d.line}:${d.column}: ${d.severity}: ${d.message}`).join('\n\n')
  navigator.clipboard?.writeText(text).then(() => {
    copied = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied = false }, 1500)
  }, () => {})
}

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
  data-log-content={textboxContent}
  data-performance-entries={JSON.stringify(agdaController.performanceEntries)}
  data-query-results={agdaController.queryResults.map(r => r.content).join('\n---\n')}
  aria-label="Messages">
  <header class="messages-header">
    {#if showHeading}
      <h2 class="panel-heading">Messages</h2>
    {/if}
    <div class="messages-tab-group" role="group" aria-label="Message view">
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          class="messages-tab"
          class:active={selectedMessageTab === tab.id}
          aria-pressed={selectedMessageTab === tab.id}
          onclick={() => { selectedMessageTab = tab.id }}>{tab.label}{#if tab.count} <span class="messages-tab-count">{tab.count}</span>{/if}</button>
      {/each}
    </div>
    <span class="messages-header-spacer"></span>
    <button
      type="button"
      class="messages-copy"
      aria-label={copied ? 'Copied' : `Copy ${selectedMessageTab === 'log' ? 'log' : selectedMessageTab}`}
      title={copied ? 'Copied' : 'Copy'}
      onclick={copyCurrentTab}>
      {#if copied}
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"></path></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>
      {/if}
    </button>
  </header>

  <div class="messages-body">
    {#if selectedMessageTab === 'log'}
      <div bind:this={textbox} class="messages-log" aria-label="Agda log" role="log">
        {#if logEntries.length}
          {#each logEntries as entry, i (i)}
            <pre class="messages-log-entry">{entry}</pre>
          {/each}
        {:else}
          <div class="messages-log-empty">No messages yet.</div>
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
}

.messages-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 2.5rem;
  box-sizing: border-box;
  padding: 6px 10px 6px 14px;
  border-bottom: 1px solid var(--app-border);
}

.panel-heading {
  margin: 0;
  font-size: .62rem;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--app-text-secondary);
}

.messages-header-spacer {
  flex: 1 1 0;
}

/* A segmented control: the active tab is a raised surface on a sunken track. */
.messages-tab-group {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: var(--app-switcher-track);
  flex-shrink: 0;
}

.messages-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: .66rem;
  white-space: nowrap;
  cursor: pointer;
}

.messages-tab:hover:not(.active) {
  color: var(--app-text-strong);
}

.messages-tab.active {
  background: var(--app-surface);
  color: var(--app-text-strong);
  font-weight: 600;
  box-shadow: 0 1px 2px var(--app-shadow);
}

.messages-tab-count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: .58rem;
  font-weight: 600;
  line-height: 1.6;
}

.messages-tab.active .messages-tab-count {
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
}

.messages-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
}

.messages-copy:hover {
  background: var(--quiet-neutral-fill-softer);
  color: var(--app-text-strong);
}

.messages-body {
  display: flex;
  flex: 1 1;
  min-height: 0;
}

.messages-log {
  flex: 1 1;
  min-height: 0;
  width: 100%;
  overflow: auto;
  padding: 4px 0;
}

.messages-log-entry {
  margin: 0;
  padding: 4px 14px;
  color: var(--app-text-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: JuliaMono, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.messages-log-empty {
  padding: 8px 14px;
  color: var(--app-text-muted);
  font-size: .68rem;
}
</style>
