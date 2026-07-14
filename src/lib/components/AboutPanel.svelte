<script>
/** @type {{
 * visible: boolean,
 * runtimeSummary: () => { label: string, value: string }[],
 * }} */
let { visible = $bindable(), runtimeSummary } = $props()
</script>

{#if visible}
  <div class="about-backdrop" role="presentation" onclick={() => { visible = false }}></div>
  <div class="about-panel" role="dialog" aria-modal="true" aria-label="About Agda Playground">
    <div class="about-header">
      <h2 class="about-title">Agda Playground</h2>
      <button type="button" class="about-close" aria-label="Close" onclick={() => { visible = false }}>✕</button>
    </div>
    <p class="about-desc">A browser-hosted single-file Agda playground for demonstrations, learning, and practice.</p>
    <dl class="about-meta">
      {#each runtimeSummary() as item (item.label)}
        <div class="about-meta-row"><dt>{item.label}</dt><dd>{item.value}</dd></div>
      {/each}
      <div class="about-meta-row"><dt>Commit</dt><dd><code>{APP_COMMIT_ID}</code></dd></div>
    </dl>
    <a class="about-github" href="https://github.com/jim9292bb/agda-playground" target="_blank" rel="noopener noreferrer">
      Source code on GitHub ↗
    </a>
  </div>
{/if}

<style>
.about-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0,0,0,.3);
}

.about-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 301;
  width: 340px;
  background: var(--quiet-neutral-fill);
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
  padding: 20px;
}

.about-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.about-title {
  font-size: 1rem;
  font-family: monospace;
  letter-spacing: .04em;
  margin: 0;
}

.about-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: .9rem;
  color: #888;
  padding: 2px 6px;
}

.about-close:hover { color: inherit; }

.about-desc {
  font-size: .85rem;
  color: #666;
  margin: 0 0 14px;
  line-height: 1.5;
}

.about-meta {
  margin: 0 0 14px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: .8rem;
}

.about-meta-row { display: contents; }

.about-meta dt { color: #999; }

.about-meta code {
  font-size: .75rem;
  background: var(--quiet-neutral-fill-softer);
  padding: 1px 4px;
  border-radius: 3px;
}

.about-github {
  display: inline-block;
  font-size: .82rem;
  color: var(--quiet-primary-text, #3b82f6);
}
</style>
