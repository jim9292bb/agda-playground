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
  padding: 3px;
  border-radius: 8px;
  background: var(--app-switcher-track);
}

.app-switcher-link {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: .72rem;
  color: var(--app-text-secondary);
  text-decoration: none;
  white-space: nowrap;
}

.app-switcher-link:hover {
  color: var(--app-text-strong);
}

.app-switcher-link.current {
  background: var(--app-surface);
  color: var(--app-text-strong);
  font-weight: 600;
  box-shadow: 0 1px 2px var(--app-shadow);
}

.app-switcher-link:focus-visible {
  outline: 2px solid var(--quiet-primary-text);
  outline-offset: 1px;
}
</style>
