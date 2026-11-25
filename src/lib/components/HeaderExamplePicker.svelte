<script>
/** @type {{
 * examples: { id: string, label: string, description?: string }[],
 * selectedExampleId: string,
 * onSelect: (id: string) => void,
 * }} */
let { examples, selectedExampleId, onSelect } = $props()

let examplesMenuOpen = $state(false)

// The button names the example currently in the editor, like a file name;
// once the source is edited away from every example it falls back to "Examples".
const selectedLabel = $derived(examples.find(e => e.id === selectedExampleId)?.label ?? null)
</script>

<div class="header-examples-wrap">
  <button
    type="button"
    class="header-examples-btn"
    aria-expanded={examplesMenuOpen}
    aria-label={selectedLabel ? `Examples (current: ${selectedLabel})` : 'Examples'}
    onclick={() => { examplesMenuOpen = !examplesMenuOpen }}>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h9l5 5v13H5z"></path><path d="M14 3v5h5"></path></svg>
    <span class="header-examples-label">{selectedLabel ?? 'Examples'}</span>
    <svg class="header-dropdown-arrow" class:open={examplesMenuOpen} viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
  </button>
  {#if examplesMenuOpen}
    <div class="header-examples-menu" role="menu">
      {#each examples as example (example.id)}
        <button
          type="button"
          class="header-examples-item"
          class:active={example.id === selectedExampleId}
          role="menuitem"
          title={example.description}
          onclick={() => { onSelect(example.id); examplesMenuOpen = false }}>
          {example.label}
        </button>
      {/each}
    </div>
    <div class="header-menu-backdrop" role="presentation" onclick={() => { examplesMenuOpen = false }}></div>
  {/if}
</div>

<style>
.header-examples-wrap {
  position: relative;
  flex: 0 0 auto;
}

.header-examples-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface);
  color: var(--app-text-strong);
  font-size: .66rem;
  white-space: nowrap;
  cursor: pointer;
}

.header-examples-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-examples-btn:hover {
  border-color: var(--app-border-strong);
  background: var(--quiet-neutral-fill-softer);
}

.header-dropdown-arrow {
  display: inline-block;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.header-dropdown-arrow.open {
  transform: rotate(180deg);
}

.header-examples-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  min-width: 200px;
  background: var(--quiet-neutral-fill-softer);
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 6px;
  box-shadow: 0 4px 12px var(--app-shadow);
  overflow: hidden;
}

/* Invisible full-viewport click-catcher so opening this dropdown and then
   clicking anywhere outside it closes it, not just re-clicking the toggle
   button. Sits below the dropdown's own z-index (200) but above everything
   else on the page. Duplicated (not shared) with the Commands dropdown in
   +page.svelte, which has the same small pattern. */
.header-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: transparent;
}

.header-examples-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  font: inherit;
  font-size: .85rem;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
}

.header-examples-item:hover {
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 12%, transparent);
}

.header-examples-item.active {
  font-weight: 600;
  color: var(--quiet-primary-text);
}
</style>
