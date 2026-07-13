<script>
import { agdaShortcutRegistry, formatAgdaShortcutHelpBinding } from '$lib/agda/shortcuts'

/** @type {{
 * visible: boolean,
 * onClose: () => void,
 * isMobile: boolean,
 * goalsPanelPosition: 'bottom' | 'right',
 * onSetGoalsPanelPosition: (pos: 'bottom' | 'right') => void,
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * deployProfiles: import('$lib/controller.svelte').DeployProfile[],
 * runtimeSummary: () => { label: string, value: string }[],
 * shortcutDrafts: Record<string, string>,
 * shortcutDraftValidation: { valid: boolean, errors: string[] },
 * shortcutOverrideMessage: string,
 * activeAgdaShortcutRegistry: import('$lib/agda/shortcuts').AgdaShortcutDefinition[],
 * onSaveShortcutOverrides: () => void,
 * onResetShortcutOverrides: () => void,
 * onSetShortcutDraft: (id: string, value: string) => void,
 * onClearShortcutDraft: (id: string) => void,
 * }} */
let {
  visible,
  onClose,
  isMobile,
  goalsPanelPosition,
  onSetGoalsPanelPosition,
  agdaController,
  deployProfiles,
  runtimeSummary,
  shortcutDrafts,
  shortcutDraftValidation,
  shortcutOverrideMessage,
  activeAgdaShortcutRegistry,
  onSaveShortcutOverrides,
  onResetShortcutOverrides,
  onSetShortcutDraft,
  onClearShortcutDraft,
} = $props()

const settingsSegments = [
  { id: 'general', label: 'General' },
  { id: 'editor', label: 'Editor' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'commands', label: 'Commands' },
  { id: 'planned', label: 'Planned' },
]

let selectedSettingsSegment = $state('general')

// Reset to the first segment each time the panel opens, matching the
// prior behavior when this reset lived in the page's openSettingsPanel().
$effect(() => {
  if (visible) selectedSettingsSegment = 'general'
})
</script>

{#if visible}
  <div class="settings-backdrop" role="presentation" onclick={onClose}></div>
  <div
    class="settings-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-panel-title">
    <header class="settings-panel-header">
      <div>
        <h2 id="settings-panel-title">Playground Settings</h2>
        <p>Configure the browser IDE experience. These settings apply to the whole page.</p>
      </div>
      <button type="button" class="settings-close-button" aria-label="Close settings" onclick={onClose}>Close</button>
    </header>

    <div class="settings-panel-main">
      <div class="settings-segmented-control" role="tablist" aria-label="Settings sections">
        {#each settingsSegments as segment}
          <button
            type="button"
            class:active={selectedSettingsSegment === segment.id}
            role="tab"
            aria-selected={selectedSettingsSegment === segment.id}
            aria-controls={`settings-panel-${segment.id}`}
            onclick={() => { selectedSettingsSegment = segment.id }}>
            {segment.label}
          </button>
        {/each}
      </div>

      <div class="settings-panel-body">
        {#if selectedSettingsSegment === 'general'}
          <div id="settings-panel-general" class="settings-section settings-overview" role="tabpanel" aria-labelledby="general-settings-title">
            <h3 id="general-settings-title">General</h3>
            <p class="settings-note">Global playground behavior for demos and practice sessions.</p>
            <div class="settings-option-grid">
              <div class="settings-option">
                <strong>Source buffer</strong>
                <span>Single-file `/source.agda` playground</span>
              </div>
              <div class="settings-option">
                <strong>Persistence</strong>
                <span>Editor contents are saved in this browser</span>
              </div>
              <label class="settings-toggle-row">
                <input type="checkbox" checked disabled />
                <span>Restore last source on reload</span>
              </label>
            </div>
          </div>
        {:else if selectedSettingsSegment === 'editor'}
          <div id="settings-panel-editor" class="settings-section" role="tabpanel" aria-labelledby="editor-settings-title">
            <h3 id="editor-settings-title">Editor</h3>
            <p class="settings-note">Display and input options for the editor.</p>
            <div class="settings-option-grid">
              <label class="settings-field">
                <span>Font</span>
                <select disabled>
                  <option>JuliaMono</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Theme</span>
                <select disabled>
                  <option>Follow browser preference</option>
                </select>
              </label>
              <label class="settings-toggle-row">
                <input type="checkbox" disabled />
                <span>Agda Unicode input method</span>
              </label>
              {#if !isMobile}
                <label class="settings-field">
                  <span>Goals panel position</span>
                  <select value={goalsPanelPosition} onchange={(event) => onSetGoalsPanelPosition(/** @type {'bottom' | 'right'} */(event.currentTarget.value))}>
                    <option value="bottom">Bottom (below editor)</option>
                    <option value="right">Right (with Messages)</option>
                  </select>
                </label>
              {/if}
            </div>
          </div>
        {:else if selectedSettingsSegment === 'runtime'}
          <div id="settings-panel-runtime" class="settings-section" role="tabpanel" aria-labelledby="runtime-settings-title">
            <h3 id="runtime-settings-title">Runtime and libraries</h3>
            <p class="settings-note">
              {#if deployProfiles.length > 1}
                Switch the Agda environment from the "Environment" selector below the Agda status card. Switching restarts the worker.
              {:else}
                This deployment has a single configured environment.
              {/if}
            </p>
            <p class="settings-note">Active environment: <strong>{agdaController.activeProfile.label}</strong></p>
            <dl class="settings-runtime-list">
              {#each runtimeSummary() as item}
                <div>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              {/each}
            </dl>
          </div>
        {:else if selectedSettingsSegment === 'commands'}
          <div id="settings-panel-commands" class="settings-section" role="tabpanel" aria-labelledby="command-settings-title">
            <h3 id="command-settings-title">Commands and shortcuts</h3>
            <p class="settings-note">Replace Agda chord shortcuts with values like <code>C-c C-g</code> (<code>C-c</code> means Ctrl + c). A chord can start with any key and be any length, e.g. <code>C-x C-s</code> or <code>C-c C-x C-r</code>. Use <code>SPC</code> or <code>Space</code> for the space bar, e.g. <code>C-c C-SPC</code>. Built-in editor keyboard shortcuts such as Cmd-Enter remain available.</p>
            <div class="shortcut-settings-actions">
              <button type="button" class="settings-action-button primary" disabled={!shortcutDraftValidation.valid} onclick={onSaveShortcutOverrides}>Save shortcuts</button>
              <button type="button" class="settings-action-button" onclick={onResetShortcutOverrides}>Reset to defaults</button>
            </div>
            {#if shortcutOverrideMessage || !shortcutDraftValidation.valid}
              <p class:settings-error={!shortcutDraftValidation.valid} class="settings-message">
                {shortcutDraftValidation.valid ? shortcutOverrideMessage : shortcutDraftValidation.errors.join(' ')}
              </p>
            {/if}
            <div class="shortcut-settings-list">
              {#each agdaShortcutRegistry as shortcut}
                {@const activeShortcut = activeAgdaShortcutRegistry.find(active => active.id === shortcut.id) ?? shortcut}
                <div class="shortcut-settings-row">
                  <div>
                    <strong>{shortcut.label}</strong>
                    <span>Default: {formatAgdaShortcutHelpBinding(shortcut)}</span>
                    <span>Effective: {formatAgdaShortcutHelpBinding(activeShortcut)}</span>
                  </div>
                  <label>
                    <span>Override</span>
                    <input
                      type="text"
                      placeholder="Default"
                      value={shortcutDrafts[shortcut.id] ?? ''}
                      oninput={event => onSetShortcutDraft(shortcut.id, event.currentTarget.value)} />
                  </label>
                  <button type="button" class="settings-action-button compact" onclick={() => onClearShortcutDraft(shortcut.id)}>Clear</button>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div id="settings-panel-planned" class="settings-section" role="tabpanel" aria-labelledby="future-settings-title">
            <h3 id="future-settings-title">Planned settings</h3>
            <p class="settings-note">Future normalization defaults, output verbosity, layout density, and command behavior settings can be added here without changing the main page layout.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
.settings-close-button {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  background: var(--quiet-neutral-fill-softer);
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 6px 10px;
}

.settings-close-button:hover,
.settings-close-button:focus-visible {
  border-color: var(--quiet-primary-stroke-soft);
  outline: none;
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, var(--quiet-neutral-fill-softer));
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(0 0 0 / .2);
}

.settings-panel {
  position: fixed;
  z-index: 41;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  width: min(920px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 48px));
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 10px;
  background: var(--quiet-neutral-fill, #fff);
  box-shadow: 0 18px 60px rgb(0 0 0 / .25);
  overflow: hidden;
}

.settings-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
}

.settings-panel-header h2,
.settings-section h3 {
  margin: 0;
}

.settings-panel-header p {
  margin: 4px 0 0;
  color: #666;
  font-size: .82rem;
}

.settings-panel-main {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  min-height: 0;
  flex: 1 1;
}

.settings-segmented-control {
  display: grid;
  align-content: start;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  border-right: 1px solid var(--quiet-neutral-stroke-softer);
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 84%, transparent);
}

.settings-segmented-control button {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: #666;
  cursor: pointer;
  font: inherit;
  font-size: .78rem;
  padding: 8px 10px;
  text-align: start;
}

.settings-segmented-control button:hover,
.settings-segmented-control button:focus-visible {
  border-color: var(--quiet-primary-stroke-soft);
  outline: none;
}

.settings-segmented-control button.active {
  border-color: var(--quiet-primary-stroke-soft);
  background: var(--quiet-primary-fill-soft);
  color: inherit;
  font-weight: 700;
}

.settings-panel-body {
  display: grid;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

@media (max-width: 620px) {
  .settings-panel {
    height: min(620px, calc(100vh - 24px));
  }

  .settings-panel-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .settings-segmented-control {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: 140px;
    border-right: 0;
    border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
  }
}

.settings-section {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 8px;
  padding: 12px;
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 72%, transparent);
}

.settings-overview {
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 12%, var(--quiet-neutral-fill-softer));
}

.settings-note {
  margin: 6px 0 12px;
  color: #666;
  font-size: .8rem;
}

.settings-option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.settings-option,
.settings-toggle-row,
.settings-field {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 6px;
  background: var(--quiet-neutral-fill-softer);
  padding: 8px;
}

.settings-option,
.settings-field {
  display: grid;
  gap: 4px;
}

.settings-option span,
.settings-field span,
.settings-toggle-row span {
  color: #666;
  font-size: .78rem;
}

.settings-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-field select {
  min-width: 0;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  padding: 4px 6px;
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 70%, white);
  color: inherit;
}

.settings-runtime-list {
  display: grid;
  gap: 6px;
  margin: 0;
}

.settings-runtime-list div {
  display: grid;
  grid-template-columns: minmax(12ch, max-content) 1fr;
  gap: 10px;
  padding: 7px 8px;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 6px;
  background: var(--quiet-neutral-fill-softer);
}

.settings-runtime-list dt {
  color: #666;
  font-size: .78rem;
}

.settings-runtime-list dd {
  margin: 0;
  font-family: JuliaMono, monospace;
  font-size: .78rem;
}

.shortcut-settings-list {
  display: grid;
  gap: 6px;
}

.shortcut-settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 220px) max-content;
  align-items: end;
  gap: 12px;
  padding: 8px;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 6px;
  background: var(--quiet-neutral-fill-softer);
}

.shortcut-settings-row div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.shortcut-settings-row span {
  color: #777;
  font-size: .72rem;
}

.shortcut-settings-row label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.shortcut-settings-row input {
  min-width: 0;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  padding: 5px 7px;
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 70%, white);
  color: inherit;
  font: inherit;
  font-family: JuliaMono, monospace;
  font-size: .78rem;
}

.shortcut-settings-row input:focus {
  border-color: var(--quiet-primary-stroke-soft);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--quiet-primary-fill-soft) 45%, transparent);
}

.settings-action-button {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  background: var(--quiet-neutral-fill-softer);
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 6px 8px;
}

.settings-action-button.primary {
  border-color: var(--quiet-primary-stroke-soft);
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 42%, var(--quiet-neutral-fill-softer));
}

.settings-action-button.compact {
  padding: 5px 7px;
}

.settings-action-button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.settings-action-button:hover:not(:disabled),
.settings-action-button:focus-visible:not(:disabled) {
  border-color: var(--quiet-primary-stroke-soft);
  outline: none;
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 22%, var(--quiet-neutral-fill-softer));
}

.shortcut-settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.settings-message {
  margin: 0 0 10px;
  color: #4f5b36;
  font-size: .78rem;
}

.settings-message.settings-error {
  color: #9a3412;
}

.settings-note code {
  color: #374151;
  font-family: JuliaMono, monospace;
  font-size: .78em;
}
</style>
