<script>
import AppSwitcher from '$lib/components/AppSwitcher.svelte'
import { appearance, onAppearanceChange } from '$lib/appearance.svelte'

/**
 * The one global header every route shares: the app's title, the
 * app switcher, then icon buttons for the light/dark theme, the source on
 * GitHub, About and Settings. Everything about the document itself (the
 * example or chapter picker, Commands, Open / Export) lives in the editor
 * panel's own head (EditorPanelHead.svelte).
 *
 * Phones (`compact`): the title is hidden (still read out) and the GitHub
 * link (also in About) is dropped, so everything fits one row.
 * @type {{
 * title: string,
 * current: 'playground' | 'notebook' | 'plfa',
 * onOpenAbout: () => void,
 * onOpenSettings: () => void,
 * compact?: boolean,
 * }} */
let { title, current, onOpenAbout, onOpenSettings, compact = false } = $props()

const SOURCE_URL = 'https://github.com/jim9292bb/agda-playground'

// Whether the app is dark right now: Settings' choice, or the OS while that's
// "follow the system". The toggle forces the opposite of what's showing;
// Settings > Appearance can go back to following the system.
let dark = $state(appearance.isDark())
$effect(() => onAppearanceChange(isDark => { dark = isDark }))
</script>

<header class="header" class:compact>
  <div class="header-brand">
    <h1 class="header-title">{title}</h1>
  </div>
  <AppSwitcher {current} />
  <div class="header-spacer"></div>
  <div class="header-actions">
    <button
      type="button"
      class="header-icon-btn header-theme-btn"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onclick={() => appearance.set(dark ? 'light' : 'dark')}>
      {#if dark}
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"></path></svg>
      {/if}
    </button>
    {#if !compact}
      <a class="header-icon-btn" href={SOURCE_URL} target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub" title="Source code on GitHub">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1-4-2-6-2m12 5v-3.8c0-1 .1-1.5-.5-2 3-.3 6-1.5 6-7A5 5 0 0 0 19 5c.1-.4.6-2-.2-4 0 0-1.5-.4-4.8 2a17 17 0 0 0-4 0C6.7.6 5.2 1 5.2 1c-.8 2-.3 3.6-.2 4A5 5 0 0 0 3.5 9.2c0 5.5 3 6.7 6 7-.6.5-.6 1.2-.5 2V22"></path></svg>
      </a>
    {/if}
    <button type="button" class="header-icon-btn" aria-label="About" title="About" onclick={onOpenAbout}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path></svg>
    </button>
    <button type="button" class="header-icon-btn" aria-label="Settings" title="Settings" onclick={onOpenSettings}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>
    </button>
  </div>
</header>

<style>
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  box-sizing: border-box;
  flex: 0 0 auto;
  padding: 0 12px;
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-border);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
}

.header-title {
  margin: 0;
  color: var(--app-text-strong);
  font-size: .82rem;
  font-weight: 700;
  letter-spacing: -.01em;
  white-space: nowrap;
}

/* The app switcher sits after a thin rule, like a second-level title. */
.header :global(.app-switcher) {
  margin-left: 4px;
  padding-left: 9px;
  border-left: 1px solid var(--app-border);
}

.header-spacer {
  flex: 1 1 0;
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.header-icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}

.header-icon-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.header-icon-btn:hover {
  background: var(--quiet-primary-fill-soft);
  color: var(--quiet-primary-text);
}

.header-icon-btn:focus-visible {
  outline: 2px solid var(--quiet-primary-text);
  outline-offset: 1px;
}

/* Phones: the title is hidden but still read out. */
.header.compact {
  gap: 4px;
  padding: 0 8px;
}

.header.compact .header-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.header.compact :global(.app-switcher) {
  margin-left: 2px;
  padding-left: 4px;
}

.header.compact .header-icon-btn {
  width: 26px;
}
</style>
