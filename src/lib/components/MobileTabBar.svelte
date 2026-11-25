<script>
/**
 * The bottom tab bar on phones: the editor, Goals (with Agda's status) and
 * Messages each get the whole screen, one at a time.
 * @type {{
 * tab: 'code' | 'goals' | 'messages',
 * goalCount: number,
 * errorCount: number,
 * codeLabel?: string,
 * }} */
let { tab = $bindable(), goalCount, errorCount, codeLabel = 'Code' } = $props()

const tabs = $derived([
  { id: /** @type {'code' | 'goals' | 'messages'} */ ('code'), label: codeLabel, badge: 0, tone: '' },
  { id: /** @type {'code' | 'goals' | 'messages'} */ ('goals'), label: 'Goals', badge: goalCount, tone: 'goals' },
  { id: /** @type {'code' | 'goals' | 'messages'} */ ('messages'), label: 'Messages', badge: errorCount, tone: 'errors' },
])
</script>

<nav class="mobile-tabbar" aria-label="Panels">
  {#each tabs as t (t.id)}
    <button
      type="button"
      class="mobile-tab"
      class:active={tab === t.id}
      aria-pressed={tab === t.id}
      onclick={() => { tab = t.id }}>
      {t.label}{#if t.badge} <span class="mobile-tab-badge {t.tone}">{t.badge}</span>{/if}
    </button>
  {/each}
</nav>

<style>
.mobile-tabbar {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.mobile-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 52px;
  border: 0;
  border-top: 2px solid transparent;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: .75rem;
  cursor: pointer;
}

.mobile-tab.active {
  border-top-color: var(--quiet-primary-text);
  color: var(--quiet-primary-text);
  font-weight: 600;
}

.mobile-tab:focus-visible {
  outline: 2px solid var(--quiet-primary-text);
  outline-offset: -4px;
}

.mobile-tab-badge {
  padding: 0 6px;
  border-radius: 999px;
  font-size: .62rem;
  font-weight: 600;
  line-height: 1.6;
}

.mobile-tab-badge.goals {
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
}

.mobile-tab-badge.errors {
  background: color-mix(in srgb, var(--app-danger-dot) 18%, var(--app-surface));
  color: var(--app-danger-text);
}
</style>
