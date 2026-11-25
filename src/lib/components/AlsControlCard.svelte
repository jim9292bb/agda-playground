<script>
/** @type {{
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * deployProfiles: import('$lib/controller.svelte').DeployProfile[],
 * onDeploymentProfileChange: (profileLabel: string) => void,
 * }} */
let { agdaController, deployProfiles, onDeploymentProfileChange } = $props()

// `tone` picks the status dot's and label's colors from theme.css: the dot
// a bright --app-<tone>-dot, the label an AA-contrast --app-<tone>-text
// (neutral: the regular muted text color).
const statusMeta = $derived({
  initial:      { tone: 'neutral', label: 'Starting...' },
  loading:      { tone: 'warning', label: 'Loading...' },
  loaded:       { tone: 'warning', label: agdaController.driveIsCreated ? 'Setting up...' : 'Fetching libraries...' },
  active:       { tone: 'success', label: 'Active' },
  deactivating: { tone: 'neutral', label: 'Stopping...' },
  errored:      { tone: 'danger',  label: 'Error' },
  exited:       { tone: 'neutral', label: 'Exited' },
  terminated:   { tone: 'neutral', label: 'Terminated' },
}[agdaController.alsWorkerStatus] ?? { tone: 'neutral', label: agdaController.alsWorkerStatus })
</script>

<div class="control-card">
  <div class="control-card-row">
    <span class="als-status-dot" style="--dot-color: var(--app-{statusMeta.tone}-dot)"></span>
    <span class="als-status-label" style="color: {statusMeta.tone === 'neutral' ? 'var(--app-text-muted)' : `var(--app-${statusMeta.tone}-text)`}">{statusMeta.label}{#if agdaController.alsWorkerStatus === 'loading' && agdaController.wasmLoadingProgress}{@const p = agdaController.wasmLoadingProgress}{@const loaded = (p.bytesLoaded / 1048576).toFixed(1)}{@const total = p.bytesTotal && p.bytesTotal >= p.bytesLoaded ? ` / ${(p.bytesTotal / 1048576).toFixed(1)}` : ''} {loaded}{total} MB{:else if agdaController.alsWorkerStatus === 'loaded' && !agdaController.driveIsCreated && agdaController.wasmLibraryFetchProgress}{@const lp = agdaController.wasmLibraryFetchProgress} {lp.fetched} / {lp.total}{/if}</span>
    <button type="button" class="btn btn-primary" onclick={() => agdaController.restartALSWASM()} disabled={agdaController.alsWorkerStatus !== 'active'}>Restart</button>
  </div>
  {#if deployProfiles.length > 1}
    <div class="control-card-profile-row">
      <label for="control-card-profile-select">Environment</label>
      <select
        id="control-card-profile-select"
        value={agdaController.selectedProfileLabel}
        disabled={agdaController.alsWorkerStatus === 'loading' || agdaController.alsWorkerStatus === 'deactivating'}
        onchange={(e) => onDeploymentProfileChange(e.currentTarget.value)}>
        {#each deployProfiles as profile (profile.label)}
          <option value={profile.label}>{profile.label}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>

<style>
.control-card {
  margin: 12px;
  border: 1px solid var(--app-border-strong);
  border-radius: 6px;
  background: var(--quiet-neutral-fill);
  overflow: hidden;
}

.control-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}

.control-card-profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--quiet-neutral-stroke-softer);
  font-size: 0.85em;
}

.control-card-profile-row label {
  color: var(--quiet-neutral-text-softer, inherit);
  flex-shrink: 0;
}

.control-card-profile-row select {
  flex: 1;
  min-width: 0;
}

.als-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dot-color);
  flex-shrink: 0;
}

.als-status-label {
  font-size: .78rem;
  font-weight: 500;
}

.btn {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  background: var(--quiet-neutral-fill-softer);
  color: var(--app-text);
  cursor: pointer;
  font: inherit;
  padding: 5px 12px;
  font-size: .82rem;
}
.btn:hover:not(:disabled),
.btn:focus-visible:not(:disabled) {
  border-color: var(--quiet-primary-stroke-soft);
  outline: none;
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, var(--quiet-neutral-fill-softer));
  color: var(--quiet-primary-text, #3b3aab);
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--quiet-primary-fill-soft);
  border-color: var(--quiet-primary-stroke-soft);
  color: var(--quiet-primary-text, #3b3aab);
}
.btn-primary:hover:not(:disabled),
.btn-primary:focus-visible:not(:disabled) {
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 85%, var(--quiet-neutral-fill));
  border-color: var(--quiet-primary-stroke);
}
</style>
