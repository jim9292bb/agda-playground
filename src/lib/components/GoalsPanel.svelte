<script>
import { attachAgdaIM } from '$lib/codemirror/agda-input-dom'

/**
 * The Goals section of the Agda side panel: every goal as `?n : type`, the
 * active one expanded with its context; and the command-input prompt for
 * commands that need an expression.
 * @type {{
 * commandInputPrompt: null | {
 *   label: string,
 *   value: string,
 *   documentVersion: number,
 *   context: import('$lib/agda/shortcut-context').AgdaShortcutContext,
 *   command: (context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>,
 *   hooks: import('$lib/agda/run-shortcut').AgdaShortcutHooks,
 * },
 * commandInputError: string,
 * panelGoalInfos: { id: number | string, range?: string, type?: string, context?: string }[],
 * activeGoalId: number | string | null,
 * activeGoalDetailStatus: 'idle' | 'loading' | 'ready' | 'error',
 * activeGoalDetailError: string,
 * commandInputElement: HTMLInputElement | undefined,
 * onSubmitCommandInput: () => void,
 * onCancelCommandInput: () => void,
 * onFocusGoal: (id: number | string) => void,
 * showHeader?: boolean,
 * }} */
let {
  commandInputPrompt,
  commandInputError,
  panelGoalInfos,
  activeGoalId,
  activeGoalDetailStatus,
  activeGoalDetailError,
  commandInputElement = $bindable(),
  onSubmitCommandInput,
  onCancelCommandInput,
  onFocusGoal,
  showHeader = true,
} = $props()

/** @param {HTMLInputElement} el */
function agdaInputAction(el) {
  const cleanup = attachAgdaIM(el)
  return { destroy: cleanup }
}
</script>

<section class="goals-section" aria-label="Goals">
  {#if showHeader}
    <header class="goals-header">
      <svg class="panel-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle></svg>
      <h2 class="panel-heading">Goals</h2>
      <span class="goals-count" class:open={panelGoalInfos.length > 0} aria-label="{panelGoalInfos.length} goals">{panelGoalInfos.length} open</span>
    </header>
  {/if}
  {#if commandInputPrompt}
    <form class="command-input-panel" onsubmit={(event) => { event.preventDefault(); onSubmitCommandInput() }}>
      <label for="command-input">Input for {commandInputPrompt.label}</label>
      <div class="command-input-row">
        <input
          id="command-input"
          use:agdaInputAction
          bind:this={commandInputElement}
          bind:value={commandInputPrompt.value}
          autocomplete="off"
          spellcheck="false"
          placeholder="Agda expression or name"
          onkeydown={(/** @type {KeyboardEvent} */ event) => { if (event.key === 'Escape') { event.preventDefault(); onCancelCommandInput() } }} />
        <button type="submit">Run</button>
        <button type="button" onclick={onCancelCommandInput}>Cancel</button>
      </div>
      {#if commandInputError}
        <div class="command-input-error">{commandInputError}</div>
      {/if}
    </form>
  {/if}
  <div class="goals-list">
    {#if panelGoalInfos.length === 0}
      <div class="goals-empty">No goals.</div>
    {:else}
      <ul class="goals-items" aria-label="All goals">
        {#each panelGoalInfos as goal (`${goal.id}-${goal.range ?? ''}`)}
          {@const active = goal.id === activeGoalId}
          <li class="goal-entry" class:active>
            <button
              type="button"
              class="goal-row"
              aria-expanded={active}
              aria-label={`Focus goal ${goal.id}`}
              onclick={() => onFocusGoal(goal.id)}>
              <span class="goal-id">?{goal.id}</span><span class="goal-type"><span class="goal-colon">{' : '}</span>{#if goal.type}{goal.type}{:else if active && activeGoalDetailStatus === 'loading'}<span class="goal-type-muted">…</span>{:else}<span class="goal-type-muted">?</span>{/if}</span>
            </button>
            {#if active}
              {#if goal.context}
                <pre class="goal-context">{goal.context}</pre>
              {:else if activeGoalDetailStatus === 'loading'}
                <div class="goal-context goal-context-empty">Loading…</div>
              {:else if activeGoalDetailStatus === 'error'}
                <div class="goal-context goal-context-empty">{activeGoalDetailError}</div>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
.goals-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.goals-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--quiet-neutral-fill-softer);
}

.panel-icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: var(--app-text-muted);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.panel-heading {
  margin: 0;
  font-size: .66rem;
  font-weight: 650;
  color: var(--app-text-strong);
}

/* "n open": amber while there's work left, quiet once there isn't. */
.goals-count {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--app-switcher-track);
  color: var(--app-text-secondary);
  font-size: .6rem;
  font-weight: 600;
}

.goals-count.open {
  background: var(--app-warning-fill);
  color: var(--app-warning-text);
}

.command-input-panel {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--app-border);
  padding: 8px 14px;
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 30%, var(--quiet-neutral-fill-softer));
}

.command-input-panel label {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-muted);
  font-size: .66rem;
  font-weight: 700;
}

.command-input-row {
  display: flex;
  gap: 6px;
}

.command-input-row input {
  min-width: 0;
  flex: 1 1;
  border: 1px solid var(--app-border-strong);
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--app-surface);
  color: inherit;
  font-family: JuliaMono, monospace;
}

.command-input-row button {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  padding: 4px 10px;
  background: var(--app-surface);
  color: inherit;
  cursor: pointer;
}

.command-input-row button:hover,
.command-input-row button:focus-visible {
  border-color: var(--quiet-primary-stroke-soft);
  outline: none;
}

.command-input-error {
  margin-top: 6px;
  color: var(--quiet-destructive-text, #a33);
  font-size: .66rem;
}

.goals-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 10px 12px;
}

.goals-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.goals-empty {
  color: var(--app-text-muted);
  font-size: .68rem;
  padding: 4px 4px;
}

.goal-entry {
  border: 1px solid transparent;
  border-radius: 8px;
  font-family: JuliaMono, monospace;
  font-size: 13px;
}

.goal-entry.active {
  border-color: var(--app-border);
  background: var(--app-surface);
  box-shadow: inset 3px 0 0 var(--quiet-primary-text), 0 1px 2px var(--app-shadow);
}

.goal-row {
  display: flex;
  align-items: baseline;
  gap: 0;
  width: 100%;
  padding: 5px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.goal-row:hover {
  background: color-mix(in srgb, var(--quiet-neutral-stroke-softer) 45%, transparent);
}

.goal-row:focus-visible {
  outline: 2px solid var(--quiet-primary-text);
  outline-offset: -2px;
}

.goal-id {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--app-switcher-track);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.goal-entry.active .goal-id {
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
}

.goal-type {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
  color: var(--app-text-strong);
}

.goal-colon,
.goal-type-muted {
  color: var(--app-text-muted);
}

.goal-context {
  margin: 0 10px;
  padding: 6px 0 8px;
  border-top: 1px dashed var(--app-border-strong);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--app-text-secondary);
  font: inherit;
  line-height: 1.5;
}

.goal-context-empty {
  color: var(--app-text-muted);
  font-family: inherit;
}
</style>
