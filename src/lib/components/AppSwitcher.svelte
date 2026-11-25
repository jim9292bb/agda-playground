<script>
import { resolve } from '$app/paths'
import { deployProfiles } from '$lib/controller.svelte'

/** @type {{ current: 'playground' | 'notebook' | 'plfa' }} */
let { current } = $props()

const hasPlfaProfile = deployProfiles.some(p => p.plfa === true)

const apps = $derived([
  { id: 'playground', label: 'Playground', href: resolve('/') },
  { id: 'notebook', label: 'Notebook', href: resolve('/literate') },
  ...(hasPlfaProfile ? [{ id: 'plfa', label: 'PLFA', href: resolve('/plfa') }] : []),
])
</script>

<nav class="app-switcher" aria-label="Switch app">
  {#each apps as app (app.id)}
    <a
      href={app.href}
      class="app-switcher-link"
      class:current={app.id === current}
      aria-current={app.id === current ? 'page' : undefined}>{app.label}</a>
  {/each}
</nav>

<style>
.app-switcher {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.app-switcher-link {
  display: flex;
  align-items: center;
  height: 28px;
  box-sizing: border-box;
  padding: 0 10px;
  border-radius: 4px;
  font-size: .68rem;
  font-weight: 550;
  color: var(--app-text-muted);
  text-decoration: none;
  white-space: nowrap;
}

.app-switcher-link:hover {
  background: var(--quiet-neutral-fill-softer);
  color: var(--app-text-strong);
}

/* The current app: the accent on its soft fill. */
.app-switcher-link.current {
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
  font-weight: 650;
}

.app-switcher-link:focus-visible {
  outline: 2px solid var(--quiet-primary-text);
  outline-offset: 1px;
}

/* Narrow phones: tighter links, so the whole header fits one row. */
@media (max-width: 420px) {
  .app-switcher-link {
    padding: 0 6px;
  }
}
</style>
