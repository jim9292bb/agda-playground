<script>
import { attachAgdaIM } from '$lib/codemirror/agda-input-dom'

/** @type {{
 * position: 'bottom' | 'right',
 * commandInputPrompt: null | {
 *   label: string,
 *   value: string,
 *   documentVersion: number,
 *   context: import('$lib/agda/shortcut-context').AgdaShortcutContext,
 *   command: (context: import('$lib/agda/shortcut-context').AgdaShortcutContext, input: string) => string | Promise<void>,
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
 * }} */
let {
  position,
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
} = $props()

/** @param {HTMLInputElement} el */
function agdaInputAction(el) {
  const cleanup = attachAgdaIM(el)
  return { destroy: cleanup }
}
</script>

<section class="goals-section" class:goals-right={position === 'right'}>
  <header class="panel-header">Goals</header>
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
      {#each panelGoalInfos as goal (`${goal.id}-${goal.range ?? ''}`)}
        <button
          type="button"
          class:active={goal.id === activeGoalId}
          class="goal-entry"
          aria-label={`Focus goal ${goal.id}`}
          onclick={() => onFocusGoal(goal.id)}>
          <div class="goal-head">?{goal.id} : {#if goal.type}{goal.type}{:else if goal.id === activeGoalId && activeGoalDetailStatus === 'loading'}<span class="goal-type-muted">…</span>{:else}<span class="goal-type-muted">?</span>{/if}</div>
          {#if goal.id === activeGoalId}
            {#if goal.context}
              <div class="goal-separator"></div>
              <pre class="goal-context">{goal.context}</pre>
            {:else if activeGoalDetailStatus === 'loading'}
              <div class="goal-separator"></div>
              <div class="goal-context-empty">Loading…</div>
            {:else if activeGoalDetailStatus === 'error'}
              <div class="goal-separator"></div>
              <div class="goal-context-empty">{activeGoalDetailError}</div>
            {/if}
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</section>

<style>
.goals-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 45%, transparent);
}

.panel-header {
  padding: 6px 8px;
  background: var(--quiet-neutral-fill-softer);
  border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
  font-size: .9rem;
  font-weight: 500;
  letter-spacing: .02em;
  text-transform: uppercase;
}

/* Goals docked to 'right': Goals is a fixed-size (5.5 of the 5.5:4.5
   split with Messages), flat outlined box — plain border, square
   corners, no shadow — instead of the 'bottom' position's plain
   in-flow panel with no card chrome of its own. */
.goals-section.goals-right {
  flex: 5.5 5.5 0;
  min-height: 0;
  margin: 0;
  border: 1px solid #e6e9ee;
  border-top-width: 2px;
  overflow: hidden;
  background: var(--quiet-neutral-fill);
}

.goals-section.goals-right .panel-header {
  background: #ffffff;
  border-bottom-width: 2px;
  border-bottom-color: #e6e9ee;
}

.command-input-panel {
  border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
  padding: 8px;
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, var(--quiet-neutral-fill-softer));
}

.command-input-panel label {
  display: block;
  margin-bottom: 6px;
  color: #666;
  font-size: .8rem;
  font-weight: 700;
}

.command-input-row {
  display: flex;
  gap: 6px;
}

.command-input-row input {
  min-width: 0;
  flex: 1 1;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  padding: 4px 6px;
  background: var(--quiet-neutral-fill-softer);
  color: inherit;
  font-family: JuliaMono, monospace;
}

.command-input-row button {
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  padding: 4px 8px;
  background: var(--quiet-neutral-fill-softer);
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
  font-size: .8rem;
}

.goals-list {
  flex: 1 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}

.goals-empty {
  color: #777;
  font-size: .8rem;
  padding: 4px 0;
}

.goal-entry {
  display: block;
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 3px 8px;
  cursor: pointer;
  color: inherit;
  font-family: JuliaMono, monospace;
  font-size: 12px;
  text-align: start;
}

.goal-entry:hover,
.goal-entry:focus-visible {
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, var(--quiet-neutral-fill-softer));
  outline: none;
}

.goal-entry.active {
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 28%, var(--quiet-neutral-fill-softer));
  box-shadow: inset 2px 0 0 var(--quiet-primary-stroke);
}

.goal-head {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.goal-type-muted {
  color: #999;
}

.goal-separator {
  border-top: 1px solid var(--quiet-neutral-stroke-softer);
  margin: 4px 0;
}

.goal-context {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--quiet-muted-text, #555);
}

.goal-context-empty {
  color: #777;
  font-size: .8rem;
}
</style>
