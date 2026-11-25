<script>
import { tick } from 'svelte'
import CommandsMenu from '$lib/components/CommandsMenu.svelte'

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   icon?: 'copy' | 'open' | 'export',
 *   run: () => void,
 *   collapse?: 'early' | 'late',
 * }} EditorAction
 */

/**
 * The editor panel's own head: the route's picker (examples or chapters),
 * the Commands menu, then the document's actions (Copy / Open / Export, and
 * + Markdown / + Code in notebooks) on the right.
 *
 * Fits whatever width the editor panel has (measured, not the window's
 * width, since the panel's share is draggable): under 640px the actions drop
 * their labels to icons and `collapse: 'early'` ones (those without an icon)
 * move into a "More actions" menu; under 420px they all do. (Not a CSS
 * container query: a query container is also the containing block of its
 * `position: fixed` descendants, which would trap the menus' backdrops.)
 * @type {{
 * picker?: import('svelte').Snippet,
 * registry: import('$lib/agda/shortcuts').AgdaShortcutDefinition[],
 * onRunCommand: (shortcut: import('$lib/agda/shortcuts').AgdaShortcutDefinition) => void,
 * menuFileActions?: { id: string, label: string, run: () => void }[],
 * activeGoalLabel?: string | null,
 * actions?: EditorAction[],
 * compact?: boolean,
 * }} */
let {
  picker,
  registry,
  onRunCommand,
  menuFileActions = [],
  activeGoalLabel = null,
  actions = [],
  compact = false,
} = $props()

const hasEarly = $derived(actions.some(action => action.collapse === 'early'))

let overflowOpen = $state(false)
let width = $state(Infinity)
const size = $derived(width <= 420 ? 'narrow' : width <= 640 ? 'medium' : 'wide')
// Widening the panel back puts every action in the row: nothing left to list.
const menuShown = $derived(overflowOpen && size !== 'wide')

/** @type {HTMLButtonElement | undefined} */
let overflowToggleEl = $state()
/** @type {HTMLDivElement | undefined} */
let overflowMenuEl = $state()

function visibleMenuItems() {
  return /** @type {HTMLButtonElement[]} */ ([...(overflowMenuEl?.querySelectorAll('.editor-overflow-item') ?? [])])
    .filter(el => el.getClientRects().length > 0)
}

async function openOverflow() {
  overflowOpen = true
  await tick()
  visibleMenuItems()[0]?.focus()
}

function closeOverflow(restoreFocus = true) {
  overflowOpen = false
  if (restoreFocus) overflowToggleEl?.focus()
}

/** @param {EditorAction} action */
function runFromOverflow(action) {
  closeOverflow(false)
  action.run()
}

/** @param {KeyboardEvent} event */
function onOverflowKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeOverflow()
    return
  }
  // Tabbing away leaves the menu behind; don't leave it open.
  if (event.key === 'Tab') {
    overflowOpen = false
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const items = visibleMenuItems()
  if (items.length === 0) return
  event.preventDefault()
  const index = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
  const next = event.key === 'ArrowDown' ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0)
  items[next].focus()
}
</script>

{#snippet icon(/** @type {EditorAction['icon']} */ name)}
  {#if name === 'copy'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V4H4v12h4"></path></svg>
  {:else if name === 'open'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3z"></path></svg>
  {:else if name === 'export'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"></path></svg>
  {/if}
{/snippet}

<div class="editor-head-container" bind:clientWidth={width}>
  <div class="editor-head {size}">
    {@render picker?.()}
    <CommandsMenu {registry} onRun={onRunCommand} fileActions={menuFileActions} {activeGoalLabel} {compact} />
    <span class="editor-head-spacer"></span>
    {#if actions.length > 0}
      <div class="editor-actions">
        {#each actions as action (action.id)}
          <button
            type="button"
            class="editor-action"
            class:has-icon={Boolean(action.icon)}
            data-collapse={action.collapse ?? 'late'}
            data-action={action.id}
            aria-label={action.label}
            title={action.label}
            onclick={action.run}>
            {@render icon(action.icon)}
            <span class="editor-action-label">{action.label}</span>
          </button>
        {/each}
        <div class="editor-overflow" class:has-early={hasEarly}>
          <button
            bind:this={overflowToggleEl}
            type="button"
            class="editor-action editor-overflow-toggle"
            aria-label="More actions"
            title="More actions"
            aria-haspopup="menu"
            aria-expanded={menuShown}
            aria-controls="editor-overflow-menu"
            onclick={() => (menuShown ? closeOverflow() : openOverflow())}>
            <svg viewBox="0 0 24 24" aria-hidden="true" class="filled"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>
          </button>
          {#if menuShown}
            <div class="editor-overflow-backdrop" role="presentation" onclick={() => closeOverflow(false)}></div>
            <div
              bind:this={overflowMenuEl}
              id="editor-overflow-menu"
              class="editor-overflow-menu"
              role="menu"
              aria-label="More actions"
              tabindex="-1"
              onkeydown={onOverflowKeydown}>
              {#each actions as action (action.id)}
                <button
                  type="button"
                  class="editor-overflow-item"
                  role="menuitem"
                  data-collapse={action.collapse ?? 'late'}
                  onclick={() => runFromOverflow(action)}>
                  {@render icon(action.icon)}
                  {action.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
.editor-head-container {
  flex: 0 0 auto;
  position: relative;
  z-index: 20;
}

.editor-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 10px;
  background: var(--quiet-neutral-fill-softer);
  border-bottom: 1px solid var(--app-border);
}

.editor-head-spacer {
  flex: 1 1 0;
  min-width: 0;
}

/* The pickers give way first when the row is short of room. */
.editor-head :global(.header-examples-wrap) {
  flex: 0 1 auto;
  min-width: 0;
}

.editor-head :global(.header-examples-btn) {
  max-width: 100%;
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.editor-action {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  min-width: 26px;
  box-sizing: border-box;
  padding: 0 7px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: .66rem;
  white-space: nowrap;
  cursor: pointer;
}

.editor-action:hover,
.editor-overflow-toggle[aria-expanded="true"] {
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
}

.editor-action:focus-visible,
.editor-overflow-item:focus-visible {
  outline: 2px solid var(--quiet-primary-text);
  outline-offset: 1px;
}

svg {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

svg.filled {
  fill: currentColor;
  stroke: none;
}

.editor-overflow {
  position: relative;
  display: none;
}

.editor-overflow-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.editor-overflow-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  padding: 5px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface);
  box-shadow: 0 12px 32px var(--app-shadow);
}

.editor-overflow-item {
  display: none;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-text-strong);
  font-size: .7rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.editor-overflow-item:hover {
  background: var(--quiet-primary-fill-soft);
}

/* Narrow panel: icons only; label-only actions move into the menu. */
.editor-head:not(.wide) .editor-action.has-icon .editor-action-label {
  display: none;
}
.editor-head:not(.wide) .editor-action.has-icon {
  padding: 0 5px;
}
.editor-head:not(.wide) .editor-action[data-collapse="early"] {
  display: none;
}
.editor-head:not(.wide) .editor-overflow.has-early {
  display: block;
}
.editor-head:not(.wide) .editor-overflow-item[data-collapse="early"] {
  display: flex;
}

/* Very narrow (phones): every action is in the menu. */
.editor-head.narrow {
  gap: 4px;
  padding: 0 6px;
}
.editor-head.narrow .editor-action:not(.editor-overflow-toggle) {
  display: none;
}
.editor-head.narrow .editor-overflow {
  display: block;
}
.editor-head.narrow .editor-overflow-item {
  display: flex;
}
</style>
