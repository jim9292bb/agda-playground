<script>
import { untrack } from 'svelte'
import AgdaStatusPanel from '$lib/components/AgdaStatusPanel.svelte'
import GoalsPanel from '$lib/components/GoalsPanel.svelte'
import MessagesPanel from '$lib/components/MessagesPanel.svelte'
import SplitPane from '$lib/components/SplitPane.svelte'
import { alsStatusMeta } from '$lib/agda/als-status'
import { loadSplitRatio, saveSplitRatio } from '$lib/split-ratio'

/**
 * The right-hand Agda panel every route shares: Agda's status and
 * environment, then Goals over Messages with a draggable (and
 * keyboard-operable) divider whose position is remembered per route.
 * @type {{
 * agdaController: import('$lib/controller.svelte').AgdaController,
 * deployProfiles: import('$lib/controller.svelte').DeployProfile[],
 * onDeploymentProfileChange: (profileLabel: string) => void,
 * splitStorageKey: string,
 * commandInputPrompt: import('svelte').ComponentProps<typeof GoalsPanel>['commandInputPrompt'],
 * commandInputError: string,
 * panelGoalInfos: { id: number | string, range?: string, type?: string, context?: string }[],
 * activeGoalId: number | string | null,
 * activeGoalDetailStatus: 'idle' | 'loading' | 'ready' | 'error',
 * activeGoalDetailError: string,
 * commandInputElement: HTMLInputElement | undefined,
 * onSubmitCommandInput: () => void,
 * onCancelCommandInput: () => void,
 * onFocusGoal: (id: number | string) => void,
 * textboxContent: string,
 * agdaDiagnostics: import('$lib/agda/diagnostics').AgdaDiagnostic[],
 * selectedMessageTab: 'log' | 'queries' | 'errors',
 * mobile?: import('$lib/mobile-panel-state.svelte').MobilePanelState | null,
 * }} */
let {
  agdaController,
  deployProfiles,
  onDeploymentProfileChange,
  splitStorageKey,
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
  textboxContent,
  agdaDiagnostics,
  selectedMessageTab = $bindable(),
  mobile = null,
} = $props()

const statusMeta = $derived(alsStatusMeta(agdaController))
let statusOpen = $state(false)

// The phone bar's one-line summary while collapsed: the goal being worked
// on, else the latest log line.
const summary = $derived.by(() => {
  const goal = panelGoalInfos.find(g => g.id === activeGoalId) ?? panelGoalInfos[0]
  if (goal) return { id: `?${goal.id}`, text: goal.type ?? '' }
  const lastLine = textboxContent.trimEnd().split(/\n+/).at(-1) ?? ''
  return { id: '', text: lastLine || 'No goals.' }
})

// The storage key is fixed for the page's lifetime.
let goalsShare = $state(untrack(() => loadSplitRatio(splitStorageKey, 0.5, [0.2, 0.85])))
$effect(() => saveSplitRatio(splitStorageKey, goalsShare))
</script>

{#snippet goals()}
  <GoalsPanel
    {commandInputPrompt}
    {commandInputError}
    {panelGoalInfos}
    {activeGoalId}
    {activeGoalDetailStatus}
    {activeGoalDetailError}
    bind:commandInputElement
    {onSubmitCommandInput}
    {onCancelCommandInput}
    {onFocusGoal}
    showHeader={!mobile}
  />
{/snippet}

{#snippet messages()}
  <MessagesPanel {agdaController} {textboxContent} {agdaDiagnostics} bind:selectedMessageTab showHeading={!mobile} />
{/snippet}

<!-- On phones (`mobile` set) the panel sits under the editor: a bar with
     Agda's status dot, a Goals / Messages switch and a collapse chevron;
     collapsed, the switch gives way to a one-line summary. Both bodies stay
     mounted (Messages keeps its log and scroll position). -->
<section class="agda-side-panel" class:mobile={Boolean(mobile)} aria-label="Agda panel" data-als-status={agdaController.alsWorkerStatus}>
  {#if mobile}
    <div class="mobile-panel-bar">
      <button
        type="button"
        class="mobile-status-btn"
        aria-label="Agda: {statusMeta.label}. {statusOpen ? 'Hide' : 'Show'} status and environment"
        aria-expanded={statusOpen && !mobile.collapsed}
        onclick={() => { statusOpen = !statusOpen; mobile.expand() }}>
        <span class="mobile-status-dot" style="--dot-color: var(--app-{statusMeta.tone}-dot)" aria-hidden="true"></span>
      </button>
      {#if mobile.collapsed}
        <button type="button" class="mobile-summary" onclick={mobile.expand}>
          {#if summary.id}<span class="mobile-summary-id">{summary.id}</span><span class="mobile-summary-colon">{' : '}</span>{/if}<span class="mobile-summary-text">{summary.text}</span>
        </button>
      {:else}
        <div class="mobile-switch" role="group" aria-label="Show">
          <button type="button" class:active={mobile.tab === 'goals'} aria-pressed={mobile.tab === 'goals'} onclick={() => { mobile.tab = 'goals' }}>
            Goals <span class="mobile-switch-count">{panelGoalInfos.length}</span>
          </button>
          <button type="button" class:active={mobile.tab === 'messages'} aria-pressed={mobile.tab === 'messages'} onclick={() => { mobile.tab = 'messages' }}>
            Messages{#if agdaDiagnostics.length} <span class="mobile-switch-count errors">{agdaDiagnostics.length}</span>{/if}
          </button>
        </div>
        <span class="mobile-bar-spacer"></span>
      {/if}
      <button
        type="button"
        class="mobile-collapse-btn"
        aria-label={mobile.collapsed ? 'Expand Agda panel' : 'Collapse Agda panel'}
        aria-expanded={!mobile.collapsed}
        onclick={mobile.toggleCollapsed}>
        <svg class:flipped={mobile.collapsed} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
      </button>
    </div>
    {#if statusOpen && !mobile.collapsed}
      <AgdaStatusPanel {agdaController} {deployProfiles} {onDeploymentProfileChange} />
    {/if}
    <div class="agda-side-mobile-pane" hidden={mobile.collapsed || mobile.tab !== 'goals'}>
      {@render goals()}
    </div>
    <div class="agda-side-mobile-pane" hidden={mobile.collapsed || mobile.tab !== 'messages'}>
      {@render messages()}
    </div>
  {:else}
    <AgdaStatusPanel {agdaController} {deployProfiles} {onDeploymentProfileChange} />
    <div class="agda-side-split">
      <SplitPane
        orientation="vertical"
        bind:ratio={goalsShare}
        dividerLabel="Resize goals and messages"
        style="--divider-min-position: 20%; --divider-max-position: 85%;">
        {#snippet start()}
          {@render goals()}
        {/snippet}
        {#snippet end()}
          {@render messages()}
        {/snippet}
      </SplitPane>
    </div>
  {/if}
</section>

<style>
.agda-side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--app-panel);
}

.agda-side-split {
  flex: 1 1 0;
  min-height: 0;
}

.agda-side-mobile-pane {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.agda-side-mobile-pane[hidden] {
  display: none;
}

.mobile-panel-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  box-sizing: border-box;
  padding: 0 6px 0 8px;
  border-bottom: 1px solid var(--app-border);
}

.mobile-status-btn,
.mobile-collapse-btn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
}

.mobile-status-btn[aria-expanded="true"] {
  background: var(--app-switcher-track);
}

.mobile-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dot-color);
}

.mobile-collapse-btn svg.flipped {
  transform: rotate(180deg);
}

.mobile-bar-spacer {
  flex: 1 1 0;
}

/* Same segmented look as the Messages tabs. */
.mobile-switch {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: var(--app-switcher-track);
}

.mobile-switch button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: .72rem;
  cursor: pointer;
}

.mobile-switch button.active {
  background: var(--app-surface);
  color: var(--app-text-strong);
  font-weight: 600;
  box-shadow: 0 1px 2px var(--app-shadow);
}

.mobile-switch-count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
  font-size: .6rem;
  font-weight: 600;
  line-height: 1.6;
}

.mobile-switch-count.errors {
  background: color-mix(in srgb, var(--app-danger-dot) 18%, var(--app-surface));
  color: var(--app-danger-text);
}

.mobile-summary {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  height: 34px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--app-text-strong);
  font-family: JuliaMono, monospace;
  font-size: 13px;
  line-height: 34px;
  text-align: left;
  cursor: pointer;
}

.mobile-summary-id {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.mobile-summary-colon {
  flex: 0 0 auto;
  white-space: pre;
  color: var(--app-text-muted);
}

.mobile-summary-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
