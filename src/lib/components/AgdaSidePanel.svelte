<script>
import { untrack } from 'svelte'
import AgdaStatusPanel from '$lib/components/AgdaStatusPanel.svelte'
import GoalsPanel from '$lib/components/GoalsPanel.svelte'
import MessagesPanel from '$lib/components/MessagesPanel.svelte'
import SplitPane from '$lib/components/SplitPane.svelte'

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
} = $props()

/** @param {string} key */
function loadSplit(key) {
  try {
    const saved = Number(localStorage.getItem(key))
    return saved >= 0.2 && saved <= 0.85 ? saved : 0.5
  } catch {
    return 0.5
  }
}

// The storage key is fixed for the page's lifetime.
let goalsShare = $state(untrack(() => loadSplit(splitStorageKey)))

$effect(() => {
  const value = goalsShare.toFixed(3)
  try {
    localStorage.setItem(splitStorageKey, value)
  } catch {
    // Storage unavailable: the split just isn't remembered.
  }
})
</script>

<section class="agda-side-panel" aria-label="Agda panel">
  <AgdaStatusPanel {agdaController} {deployProfiles} {onDeploymentProfileChange} />
  <div class="agda-side-split">
    <SplitPane
      orientation="vertical"
      bind:ratio={goalsShare}
      dividerLabel="Resize goals and messages"
      style="--divider-min-position: 20%; --divider-max-position: 85%;">
      {#snippet start()}
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
        />
      {/snippet}
      {#snippet end()}
        <MessagesPanel {agdaController} {textboxContent} {agdaDiagnostics} bind:selectedMessageTab />
      {/snippet}
    </SplitPane>
  </div>
</section>

<style>
.agda-side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: color-mix(in srgb, var(--quiet-neutral-fill-softer) 60%, var(--quiet-neutral-fill));
}

.agda-side-split {
  flex: 1 1 0;
  min-height: 0;
}
</style>
