<script>
/** @type {{
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * deployProfiles: import('$lib/controller.svelte').DeployProfile[],
 * onDeploymentProfileChange: (profileLabel: string) => void,
 * onToggleCommands: () => void,
 * onOpenAbout: () => void,
 * onOpenSettings: () => void,
 * }} */
let { agdaController, deployProfiles, onDeploymentProfileChange, onToggleCommands, onOpenAbout, onOpenSettings } = $props()

const statusMeta = $derived({
  initial:      { color: '#888',    label: 'Starting...' },
  loading:      { color: '#f59e0b', label: 'Loading...' },
  loaded:       { color: '#f59e0b', label: agdaController.driveIsCreated ? 'Setting up...' : 'Fetching libraries...' },
  active:       { color: '#22c55e', label: 'Active' },
  deactivating: { color: '#888',    label: 'Stopping...' },
  errored:      { color: '#ef4444', label: 'Error' },
  exited:       { color: '#888',    label: 'Exited' },
  terminated:   { color: '#888',    label: 'Terminated' },
}[agdaController.alsWorkerStatus] ?? { color: '#888', label: agdaController.alsWorkerStatus })
</script>

<div class="control-card">
  <div class="control-card-row">
    <span class="als-status-dot" style="--dot-color: {statusMeta.color}"></span>
    <span class="als-status-label" style="color: {statusMeta.color}">{statusMeta.label}{#if agdaController.alsWorkerStatus === 'loading' && agdaController.wasmLoadingProgress}{@const p = agdaController.wasmLoadingProgress}{@const loaded = (p.bytesLoaded / 1048576).toFixed(1)}{@const total = p.bytesTotal && p.bytesTotal >= p.bytesLoaded ? ` / ${(p.bytesTotal / 1048576).toFixed(1)}` : ''} {loaded}{total} MB{:else if agdaController.alsWorkerStatus === 'loaded' && !agdaController.driveIsCreated && agdaController.wasmLibraryFetchProgress}{@const lp = agdaController.wasmLibraryFetchProgress} {lp.fetched} / {lp.total}{/if}</span>
    <button type="button" class="btn btn-primary" onclick={() => agdaController.restartALSWASM()} disabled={agdaController.alsWorkerStatus !== 'active'}>Restart</button>
    <div class="control-card-actions">
    <button type="button" class="control-btn control-icon-btn" aria-label="Help" onclick={onToggleCommands}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0-1a8 8 0 1 1 0 16A8 8 0 0 1 8 0z"/>
      </svg>
    </button>
    <button type="button" class="control-btn control-icon-btn" aria-label="About" onclick={onOpenAbout}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
        <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
      </svg>
    </button>
    <a class="control-btn control-icon-btn" href="https://github.com/jim9292bb/agda-playground" target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
    </a>
    <button type="button" class="control-btn control-icon-btn" aria-label="Settings" onclick={onOpenSettings}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
        <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.475l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
      </svg>
    </button>
    </div>
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
  border: 1px solid #b0b4bdb5;
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

.control-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
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

.control-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: .82rem;
  cursor: pointer;
  text-decoration: none;
}

.control-btn:hover {
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, transparent);
  border-color: var(--quiet-primary-stroke-soft);
  color: var(--quiet-primary-text, #3b3aab);
}

.control-icon-btn {
  padding: 8px 10px;
  line-height: 0;
  border: none;
  color: #374151;
}

.control-icon-btn svg {
  width: 18px;
  height: 18px;
}

.control-icon-btn:hover {
  border: none;
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 22%, transparent);
  color: var(--quiet-primary-text, #3b3aab);
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
  color: #374151;
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
