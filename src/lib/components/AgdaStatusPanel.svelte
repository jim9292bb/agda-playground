<script>
import { tick } from 'svelte'
import { resolveProfileLibraries } from '$lib/controller.svelte'
import { alsStatusMeta } from '$lib/agda/als-status'

/**
 * Agda's status (with Restart) and the environment picker, at the top of
 * the Agda side panel.
 * @type {{
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * deployProfiles: import('$lib/controller.svelte').DeployProfile[],
 * onDeploymentProfileChange: (profileLabel: string) => void,
 * }} */
let { agdaController, deployProfiles, onDeploymentProfileChange } = $props()

const statusMeta = $derived(alsStatusMeta(agdaController))

const progress = $derived.by(() => {
  const status = agdaController.alsWorkerStatus
  const p = agdaController.wasmLoadingProgress
  if (status === 'loading' && p) {
    const loaded = (p.bytesLoaded / 1048576).toFixed(1)
    const total = p.bytesTotal && p.bytesTotal >= p.bytesLoaded ? ` / ${(p.bytesTotal / 1048576).toFixed(1)}` : ''
    return `${loaded}${total} MB`
  }
  const lp = agdaController.wasmLibraryFetchProgress
  if (status === 'loaded' && !agdaController.driveIsCreated && lp) return `${lp.fetched} / ${lp.total}`
  return ''
})

/** @param {import('$lib/controller.svelte').DeployProfile} profile */
function describe(profile) {
  const libs = resolveProfileLibraries(profile)
    .map(lib => [lib.label ?? lib.name, lib.version].filter(Boolean).join(' '))
  return { name: `Agda ${profile.als}`, libs: libs.join(' · '), summary: [`Agda ${profile.als}`, ...libs].join(' · ') }
}

const environments = $derived(deployProfiles.map(profile => ({ label: profile.label, ...describe(profile) })))
const current = $derived(environments.find(e => e.label === agdaController.selectedProfileLabel) ?? environments[0])
const switching = $derived(agdaController.alsWorkerStatus === 'loading' || agdaController.alsWorkerStatus === 'deactivating')

let open = $state(false)
/** @type {HTMLButtonElement | undefined} */
let toggleEl = $state()
/** @type {HTMLDivElement | undefined} */
let listEl = $state()

async function openList() {
  open = true
  await tick()
  const options = /** @type {HTMLButtonElement[]} */ ([...(listEl?.querySelectorAll('[role=option]') ?? [])])
  ;(options.find(o => o.getAttribute('aria-selected') === 'true') ?? options[0])?.focus()
}

function closeList(restoreFocus = true) {
  open = false
  if (restoreFocus) toggleEl?.focus()
}

/** @param {string} label */
function pick(label) {
  closeList()
  if (label !== agdaController.selectedProfileLabel) onDeploymentProfileChange(label)
}

/** @param {KeyboardEvent} event */
function onListKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeList()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const options = /** @type {HTMLButtonElement[]} */ ([...(listEl?.querySelectorAll('[role=option]') ?? [])])
  const index = options.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
  const next = event.key === 'ArrowDown' ? Math.min(index + 1, options.length - 1) : Math.max(index - 1, 0)
  options[next]?.focus()
}
</script>

<section class="agda-status" aria-label="Agda status">
  <div class="agda-status-row">
    <span class="agda-status-title">ALS</span>
    <span class="agda-status-dot" style="--dot-color: var(--app-{statusMeta.tone}-dot)" aria-hidden="true"></span>
    <span
      class="agda-status-label"
      style="color: {statusMeta.tone === 'neutral' ? 'var(--app-text-muted)' : `var(--app-${statusMeta.tone}-text)`}">{statusMeta.label}{progress ? ` ${progress}` : ''}</span>
    <span class="agda-status-spacer"></span>
    <button
      type="button"
      class="agda-status-btn"
      onclick={() => agdaController.restartALSWASM()}
      disabled={agdaController.alsWorkerStatus !== 'active'}>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"></path></svg>
      Restart
    </button>
  </div>

  {#if environments.length > 1}
    <div class="agda-env">
      <span class="agda-env-caption" aria-hidden="true">Environment</span>
      <button
        bind:this={toggleEl}
        type="button"
        class="agda-env-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="agda-env-list"
        aria-label="Agda environment: {current?.summary}"
        data-profile-label={current?.label}
        disabled={switching}
        onclick={() => (open ? closeList() : openList())}>
        <span class="agda-env-summary">{current?.summary}</span>
        <svg class="agda-env-arrow" class:open viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
      </button>
      {#if open}
        <div class="agda-env-backdrop" role="presentation" onclick={() => closeList(false)}></div>
        <div
          bind:this={listEl}
          id="agda-env-list"
          class="agda-env-list"
          role="listbox"
          aria-label="Agda environment"
          tabindex="-1"
          onkeydown={onListKeydown}>
          {#each environments as env (env.label)}
            {@const selected = env.label === current?.label}
            <button
              type="button"
              class="agda-env-option"
              class:selected
              role="option"
              aria-selected={selected}
              data-profile-label={env.label}
              onclick={() => pick(env.label)}>
              <span class="agda-env-check" aria-hidden="true">
                {#if selected}
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"></path></svg>
                {/if}
              </span>
              <span class="agda-env-text">
                <span class="agda-env-name">{env.name}</span>
                <span class="agda-env-libs">{env.libs}</span>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if current}
    <div class="agda-env">
      <span class="agda-env-caption">Environment</span>
      <span class="agda-env-static">{current.summary}</span>
    </div>
  {/if}
</section>

<style>
/* Two compact rows: "ALS | ● status | Restart", then the environment. */
.agda-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px 12px 6px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-panel);
}

.agda-status-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  min-width: 0;
}

.agda-status-title {
  flex: 0 0 auto;
  padding-right: 8px;
  border-right: 1px solid var(--app-border);
  color: var(--app-text-strong);
  font-size: .66rem;
  font-weight: 650;
}

.agda-status-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dot-color);
}

.agda-status-label {
  font-size: .68rem;
  font-weight: 600;
}

.agda-status-spacer {
  flex: 1 1 0;
}

.agda-status-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  box-sizing: border-box;
  padding: 0 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: .64rem;
  cursor: pointer;
}

.agda-status-btn:hover:not(:disabled) {
  border-color: var(--quiet-primary-stroke-soft);
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
}

.agda-status-btn:disabled {
  cursor: default;
  color: var(--app-text-muted);
}

.agda-env {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agda-env-caption {
  flex: 0 0 auto;
  color: var(--app-text-muted);
  font-size: .62rem;
}

.agda-env-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  height: 24px;
  box-sizing: border-box;
  padding: 0 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--quiet-neutral-fill-softer);
  color: var(--app-text-strong);
  font-size: .64rem;
  text-align: left;
  cursor: pointer;
}

.agda-env-toggle[aria-expanded="true"] {
  border-color: var(--quiet-primary-text);
}

.agda-env-toggle:disabled {
  cursor: progress;
  color: var(--app-text-muted);
}

.agda-env-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agda-env-arrow {
  flex: 0 0 auto;
  transition: transform .15s;
}

.agda-env-arrow.open {
  transform: rotate(180deg);
}

.agda-env-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.agda-env-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 12px 32px var(--app-shadow);
}

.agda-env-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: .66rem;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

.agda-env-option:hover,
.agda-env-option:focus-visible {
  background: var(--quiet-neutral-fill-softer);
  outline: none;
}

.agda-env-option.selected {
  background: var(--quiet-primary-fill-soft);
}

.agda-env-check {
  flex: 0 0 16px;
  display: flex;
  justify-content: center;
  padding-top: 2px;
  color: var(--quiet-primary-text);
}

.agda-env-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.agda-env-name {
  font-weight: 600;
  color: var(--app-text-strong);
}

.agda-env-libs {
  color: var(--app-text-secondary);
}

.agda-env-static {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: .64rem;
  color: var(--app-text-secondary);
}
</style>
