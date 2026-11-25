<script>
import { tick } from 'svelte'
import { formatAgdaShortcutHelpBinding } from '$lib/agda/shortcuts'

/**
 * @typedef {{ id: string, label: string, run: () => void }} FileAction
 * @typedef {{ key: string, label: string, keys: string, run: () => void }} MenuItem
 */

/** @type {{
 * registry: import('$lib/agda/shortcuts').AgdaShortcutDefinition[],
 * onRun: (shortcut: import('$lib/agda/shortcuts').AgdaShortcutDefinition) => void,
 * fileActions?: FileAction[],
 * activeGoalLabel?: string | null,
 * compact?: boolean,
 * }} */
let { registry, onRun, fileActions = [], activeGoalLabel = null, compact = false } = $props()

// Commands that act on the goal under the cursor; everything else works
// anywhere in the file (several of those fall back to a top-level form
// outside a goal), so it goes under "File".
const GOAL_COMMAND_IDS = new Set([
  'goal-type', 'context', 'goal-type-context', 'goal-type-context-infer',
  'goal-type-context-check', 'give', 'refine', 'auto', 'elaborate-give',
  'helper-function', 'case-split',
])

let open = $state(false)
let query = $state('')
/** @type {HTMLButtonElement | undefined} */
let toggleEl = $state()
/** @type {HTMLInputElement | undefined} */
let searchEl = $state()
/** @type {HTMLDivElement | undefined} */
let panelEl = $state()

/** @param {import('$lib/agda/shortcuts').AgdaShortcutDefinition} shortcut @returns {MenuItem} */
const shortcutItem = shortcut => ({
  key: shortcut.id,
  label: shortcut.label,
  keys: formatAgdaShortcutHelpBinding(shortcut),
  run: () => onRun(shortcut),
})

const groups = $derived.by(() => {
  const needle = query.trim().toLowerCase()
  /** @param {MenuItem} item */
  const matches = item => !needle
    || item.label.toLowerCase().includes(needle)
    || item.keys.toLowerCase().includes(needle)
  const file = [
    ...registry.filter(s => !GOAL_COMMAND_IDS.has(s.id)).map(shortcutItem),
    ...fileActions.map(action => ({ key: action.id, label: action.label, keys: '', run: action.run })),
  ].filter(matches)
  const goal = registry.filter(s => GOAL_COMMAND_IDS.has(s.id)).map(shortcutItem).filter(matches)
  return [
    { id: 'file', label: 'File', items: file },
    { id: 'goal', label: activeGoalLabel ? `Goal ${activeGoalLabel}` : 'Goal', items: goal },
  ].filter(group => group.items.length > 0)
})

async function openMenu() {
  query = ''
  open = true
  await tick()
  searchEl?.focus()
}

/** @param {{ restoreFocus?: boolean }} [options] */
function closeMenu({ restoreFocus = true } = {}) {
  open = false
  if (restoreFocus) toggleEl?.focus()
}

/** @param {MenuItem} item */
function runItem(item) {
  // The command usually hands focus to the editor itself; don't pull it back
  // to the toggle afterwards.
  closeMenu({ restoreFocus: false })
  item.run()
}

function itemButtons() {
  return /** @type {HTMLButtonElement[]} */ ([...(panelEl?.querySelectorAll('.commands-menu-item') ?? [])])
}

/** @param {KeyboardEvent} event */
function onPanelKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeMenu()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const items = itemButtons()
  if (items.length === 0) return
  event.preventDefault()
  const index = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
  if (event.key === 'ArrowDown') {
    items[index < 0 ? 0 : Math.min(index + 1, items.length - 1)].focus()
  } else if (index <= 0) {
    searchEl?.focus()
  } else {
    items[index - 1].focus()
  }
}

/** @param {KeyboardEvent} event */
function onSearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    const first = groups[0]?.items[0]
    if (first) runItem(first)
  }
}

/** Ctrl-K (Cmd-K on macOS) opens the menu from anywhere on the page. */
function onWindowKeydown(/** @type {KeyboardEvent} */ event) {
  if (event.defaultPrevented || event.isComposing) return
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  if (event.key.toLowerCase() !== 'k') return
  event.preventDefault()
  if (open) closeMenu()
  else openMenu()
}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="commands-menu-wrap">
  <button
    bind:this={toggleEl}
    type="button"
    class="commands-menu-toggle"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-controls="commands-menu"
    aria-label={compact ? 'Commands' : undefined}
    title={compact ? 'Commands' : undefined}
    onclick={() => (open ? closeMenu() : openMenu())}>
    <!-- A keyboard: the menu is Agda's commands with their key chords. -->
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 16h10"></path></svg>
    {#if !compact}
      Commands
      <svg class="commands-menu-arrow" class:open viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
    {/if}
  </button>
  {#if open}
    <div class="commands-menu-backdrop" role="presentation" onclick={() => closeMenu({ restoreFocus: false })}></div>
    <div
      bind:this={panelEl}
      id="commands-menu"
      class="commands-menu"
      class:compact
      role="dialog"
      aria-label="Agda commands"
      tabindex="-1"
      onkeydown={onPanelKeydown}>
      <label class="commands-menu-search">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
        <span class="sr-only">Search commands</span>
        <input bind:this={searchEl} bind:value={query} type="search" placeholder="Search commands…" autocomplete="off" spellcheck="false" onkeydown={onSearchKeydown}>
        <kbd>Ctrl K</kbd>
      </label>
      <div class="commands-menu-groups">
        {#each groups as group (group.id)}
          <div class="commands-menu-group" role="group" aria-label={group.label}>
            <div class="commands-menu-group-label" aria-hidden="true">{group.label}</div>
            {#each group.items as item (item.key)}
              <button type="button" class="commands-menu-item" onclick={() => runItem(item)}>
                <span class="commands-menu-item-label">{item.label}</span>
                {#if item.keys}<kbd>{item.keys}</kbd>{/if}
              </button>
            {/each}
          </div>
        {:else}
          <p class="commands-menu-empty">No commands match “{query.trim()}”.</p>
        {/each}
      </div>
      <p class="commands-panel-note">In the editor, Tab indents. To move focus out of the editor with the keyboard, press Esc, then Tab.</p>
    </div>
  {/if}
</div>

<style>
.commands-menu-wrap {
  position: relative;
  flex: 0 0 auto;
}

.commands-menu-toggle {
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

.commands-menu-toggle:hover,
.commands-menu-toggle[aria-expanded="true"] {
  background: var(--quiet-neutral-fill-softer);
  border-color: var(--app-border-strong);
}

.commands-menu-arrow {
  transition: transform .15s;
}

.commands-menu-arrow.open {
  transform: rotate(180deg);
}

.commands-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.commands-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 24px));
  max-height: min(560px, calc(100vh - 80px));
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  box-shadow: 0 12px 32px var(--app-shadow);
}

/* Phones: the toggle is icon-only and the menu spans the screen under the header. */
.commands-menu.compact {
  position: fixed;
  top: 52px;
  left: 12px;
  right: 12px;
  width: auto;
  max-height: calc(100vh - 140px);
}

.commands-menu-toggle[aria-label] {
  padding: 4px 8px;
}

.commands-menu-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 6px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--quiet-neutral-fill-softer);
  color: var(--app-text-muted);
}

.commands-menu-search:focus-within {
  border-color: var(--quiet-primary-text);
}

.commands-menu-search input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text-strong);
  font-size: .72rem;
}

.commands-menu-groups {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.commands-menu-group + .commands-menu-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--app-border);
}

.commands-menu-group-label {
  padding: 6px 10px 4px;
  font-size: .6rem;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.commands-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 5px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-strong);
  font-size: .72rem;
  text-align: left;
  cursor: pointer;
}

.commands-menu-item:hover,
.commands-menu-item:focus-visible {
  background: var(--quiet-primary-fill-soft);
  outline: none;
}

.commands-menu-item-label {
  flex: 1 1 auto;
}

kbd {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--quiet-neutral-fill-softer);
  color: var(--app-text-secondary);
  font-family: JuliaMono, monospace;
  font-size: .6rem;
  line-height: 1.5;
  white-space: nowrap;
}

.commands-menu-empty {
  margin: 0;
  padding: 10px;
  font-size: .72rem;
  color: var(--app-text-muted);
}

.commands-panel-note {
  margin: 4px 0 0;
  padding: 8px 10px 4px;
  border-top: 1px solid var(--app-border);
  font-size: .62rem;
  color: var(--app-text-secondary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
