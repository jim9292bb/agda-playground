<script>
/** @typedef {{ part: string, id: string, title: string, source: string }} PlfaChapter */

/** @type {{
 * chapters: PlfaChapter[],
 * selectedChapterId: string | null,
 * onSelect: (chapter: PlfaChapter) => void,
 * }} */
let { chapters, selectedChapterId, onSelect } = $props()

let menuOpen = $state(false)

/** @type {Record<string, string>} */
const partLabels = { part1: 'Part 1: Logical Foundations', part2: 'Part 2: Programming Language Foundations', part3: 'Part 3: Denotational Semantics' }

/** @type {{ part: string, label: string, chapters: PlfaChapter[] }[]} */
const groups = $derived(
  [...new Set(chapters.map(c => c.part))].map(part => ({
    part,
    label: partLabels[part] ?? part,
    chapters: chapters.filter(c => c.part === part),
  }))
)
</script>

<div class="header-examples-wrap">
  <button
    type="button"
    class="header-examples-btn"
    aria-expanded={menuOpen}
    onclick={() => { menuOpen = !menuOpen }}>
    Chapters
    <svg class="header-dropdown-arrow" class:open={menuOpen} viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
  </button>
  {#if menuOpen}
    <div class="header-examples-menu" role="menu">
      {#each groups as group (group.part)}
        <div class="header-examples-group-label">{group.label}</div>
        {#each group.chapters as chapter (chapter.id)}
          <button
            type="button"
            class="header-examples-item"
            class:active={chapter.id === selectedChapterId}
            role="menuitem"
            onclick={() => { onSelect(chapter); menuOpen = false }}>
            {chapter.title}
          </button>
        {/each}
      {/each}
    </div>
    <div class="header-menu-backdrop" role="presentation" onclick={() => { menuOpen = false }}></div>
  {/if}
</div>

<style>
.header-examples-wrap {
  position: relative;
  flex: 0 0 auto;
}

.header-examples-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 4px;
  background: var(--quiet-neutral-fill);
  color: #374151;
  font: inherit;
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
}

.header-examples-btn:hover {
  border-color: var(--quiet-primary-stroke-soft);
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 18%, var(--quiet-neutral-fill));
  color: var(--quiet-primary-text, #3b3aab);
}

.header-dropdown-arrow {
  display: inline-block;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.header-dropdown-arrow.open {
  transform: rotate(180deg);
}

.header-examples-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  min-width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--quiet-neutral-fill-softer);
  border: 1px solid var(--quiet-neutral-stroke-softer);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,.1);
}

.header-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: transparent;
}

.header-examples-group-label {
  padding: 8px 14px 4px;
  font-size: .72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .03em;
  color: var(--quiet-neutral-seed, #8b8c93);
}

.header-examples-item {
  display: block;
  width: 100%;
  padding: 6px 14px;
  text-align: left;
  font: inherit;
  font-size: .85rem;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
}

.header-examples-item:hover {
  background: color-mix(in srgb, var(--quiet-primary-fill-soft) 12%, transparent);
}

.header-examples-item.active {
  font-weight: 600;
  color: var(--quiet-primary-text);
}
</style>
