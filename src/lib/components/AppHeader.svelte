<script>
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
} = $props()
</script>

<header class="header">
  <h1 class="header-title">{title}</h1>
  <AppSwitcher {current} />
  {@render picker?.()}
  <CommandsMenu {registry} onRun={onRunCommand} {fileActions} {activeGoalLabel} />
  {@render actions?.()}
  <div class="header-spacer"></div>
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
</header>

<style>
.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 7px 10px;
  background: var(--quiet-neutral-fill-softer);
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
