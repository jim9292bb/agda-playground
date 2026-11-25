<script>
import { tick } from 'svelte'
import AppSwitcher from '$lib/components/AppSwitcher.svelte'
import CommandsMenu from '$lib/components/CommandsMenu.svelte'

/**
 * The one header row every route shares: title, app switcher, the route's
 * own picker (examples or chapters), the Commands menu, route-specific
 * actions, then About and Settings on the right. Wraps onto more rows only
 * when it doesn't fit.
 * @type {{
 * title: string,
 * current: 'playground' | 'notebook' | 'plfa',
 * picker?: import('svelte').Snippet,
 * actions?: import('svelte').Snippet,
 * registry: import('$lib/agda/shortcuts').AgdaShortcutDefinition[],
 * onRunCommand: (shortcut: import('$lib/agda/shortcuts').AgdaShortcutDefinition) => void,
 * fileActions?: { id: string, label: string, run: () => void }[],
 * activeGoalLabel?: string | null,
 * onOpenAbout: () => void,
 * onOpenSettings: () => void,
 * compact?: boolean,
 * }} */
let {
  title,
  current,
  picker,
  actions,
  registry,
  onRunCommand,
  fileActions = [],
  activeGoalLabel = null,
  onOpenAbout,
  onOpenSettings,
  compact = false,
} = $props()

// Phones (`compact`): one row of title, picker, an icon-only Commands and a
// "More" menu holding the app switcher, the route's actions, About and
// Settings.
let moreOpen = $state(false)
/** @type {HTMLButtonElement | undefined} */
let moreToggleEl = $state()
/** @type {HTMLDivElement | undefined} */
let moreMenuEl = $state()

async function openMore() {
  moreOpen = true
  await tick()
  const first = /** @type {HTMLElement | null | undefined} */ (moreMenuEl?.querySelector('a, button'))
  first?.focus()
}

function closeMore(restoreFocus = true) {
  moreOpen = false
  if (restoreFocus) moreToggleEl?.focus()
}

/** @param {() => void} action */
function runFromMore(action) {
  closeMore(false)
  action()
}
</script>

<header class="header" class:compact>
  <h1 class="header-title">{title}</h1>
  {#if !compact}
    <AppSwitcher {current} />
  {/if}
  {@render picker?.()}
  <CommandsMenu {registry} onRun={onRunCommand} {fileActions} {activeGoalLabel} {compact} />
  {#if !compact}
    {@render actions?.()}
  {/if}
  <div class="header-spacer"></div>
  {#if compact}
    <div class="header-more-wrap">
      <button
        bind:this={moreToggleEl}
        type="button"
        class="header-action-btn header-more-toggle"
        aria-label="More"
        title="More"
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        aria-controls="header-more-menu"
        onclick={() => (moreOpen ? closeMore() : openMore())}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>
      </button>
      {#if moreOpen}
        <div class="header-more-backdrop" role="presentation" onclick={() => closeMore(false)}></div>
        <div
          bind:this={moreMenuEl}
          id="header-more-menu"
          class="header-more-menu"
          role="dialog"
          aria-label="More"
          tabindex="-1"
          onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMore() } }}>
          <AppSwitcher {current} />
          {#if actions}
            <div class="header-more-actions" onclick={() => closeMore(false)}>
              {@render actions()}
            </div>
          {/if}
          <div class="header-more-actions">
            <button type="button" class="header-action-btn" onclick={() => runFromMore(onOpenAbout)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path></svg>
              About
            </button>
            <button type="button" class="header-action-btn" onclick={() => runFromMore(onOpenSettings)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>
              Settings
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="header-actions">
      <button type="button" class="header-action-btn" onclick={onOpenAbout}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path></svg>
        About
      </button>
      <button type="button" class="header-action-btn" onclick={onOpenSettings}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>
        Settings
      </button>
    </div>
  {/if}
</header>

<style>
.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 7px 10px;
  background: var(--app-chrome);
  border-bottom: 1px solid var(--quiet-neutral-stroke-softer);
}

.header-title {
  margin: 0;
  color: var(--app-text-strong);
  font-size: .82rem;
  font-weight: 600;
  white-space: nowrap;
}

.header-spacer {
  flex: 1 1 0;
}

/* Phones: everything stays on one row; the picker gives way first. */
.header.compact {
  flex-wrap: nowrap;
}

.header.compact .header-spacer {
  min-width: 0;
}

.header.compact :global(.header-examples-wrap) {
  flex: 0 1 auto;
  min-width: 0;
}

.header.compact :global(.header-examples-btn) {
  max-width: 100%;
}

.header-more-wrap {
  position: relative;
  flex: 0 0 auto;
}

.header-more-toggle {
  padding: 4px 8px;
}

.header-more-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.header-more-menu {
  position: fixed;
  top: 52px;
  right: 12px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: min(300px, calc(100vw - 24px));
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  box-shadow: 0 12px 32px var(--app-shadow);
}

.header-more-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* Also styles route-specific action buttons passed in through `actions`. */
.header :global(.header-action-btn) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface);
  color: var(--app-text-strong);
  font-size: .72rem;
  cursor: pointer;
}

.header :global(.header-action-btn:hover) {
  border-color: var(--app-border-strong);
  background: var(--quiet-neutral-fill-softer);
}
</style>
