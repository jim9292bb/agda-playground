<script>
/** @type {{ agdaController: import('$lib/controller.svelte').AgdaController }} */
let { agdaController } = $props()
</script>

<section class="queries-panel" aria-label="Agda query results">
  <header class="queries-panel-header">
    <span>Query results</span>
    {#if agdaController.queryResults.length}
      <button type="button" class="queries-clear-btn" onclick={() => agdaController.clearQueryResults()}>Clear</button>
    {/if}
  </header>
  {#if agdaController.queryResults.length}
    <div class="queries-list">
      {#each agdaController.queryResults as result (result.id)}
        <div class="query-result">
          <div class="query-result-label">{result.label}</div>
          <pre class="query-result-content">{result.content}</pre>
        </div>
      {/each}
    </div>
  {:else}
    <div class="queries-empty">No query results yet. Use C-c C-t, C-c C-,, C-c C-e, etc.</div>
  {/if}
</section>

<style>
.queries-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  overflow: auto;
  gap: 0;
}

.queries-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #374151;
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
}

.queries-clear-btn {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  padding: 1px 7px;
  background: transparent;
  color: #777;
  font-size: .75rem;
  cursor: pointer;
}

.queries-clear-btn:hover {
  border-color: var(--quiet-primary-stroke-soft);
  color: inherit;
}

.queries-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queries-empty {
  color: #777;
  font-size: .8rem;
}

.query-result {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  background: var(--quiet-neutral-fill-softer);
  overflow: hidden;
}

.query-result-label {
  padding: 3px 8px;
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 60%, transparent);
  border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
  color: #666;
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
}

.query-result-content {
  margin: 0;
  padding: 6px 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: JuliaMono, monospace;
  font-size: 12px;
}
</style>
