<script>
import { resolve } from '$app/paths'
import { deployProfiles } from '$lib/controller.svelte'

/** @type {{ current: 'playground' | 'notebook' | 'plfa' }} */
let { current } = $props()

const hasPlfaProfile = deployProfiles.some(p => p.plfa === true)
</script>

<nav class="app-switcher" aria-label="Switch app">
  {#if current !== 'playground'}
    <a href={resolve('/')} class="app-switcher-link">Playground</a>
  {/if}
  {#if current !== 'notebook'}
    <a href={resolve('/literate')} class="app-switcher-link">Notebook</a>
  {/if}
  {#if current !== 'plfa' && hasPlfaProfile}
    <a href={resolve('/plfa')} class="app-switcher-link">PLFA</a>
  {/if}
</nav>

<style>
.app-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.app-switcher-link {
  font-size: .8rem;
  font-weight: 600;
  color: var(--quiet-neutral-seed, #8b8c93);
  text-decoration: none;
  white-space: nowrap;
}

.app-switcher-link:hover {
  color: var(--quiet-primary-text, #3b3aab);
  text-decoration: underline;
}
</style>
