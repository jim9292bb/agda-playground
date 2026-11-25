<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    orientation = 'horizontal' as 'horizontal' | 'vertical',
    position = 0.5,
    ratio = $bindable(position),
    class: className = '',
    style = '',
    dividerLabel = 'Resize panels',
    start,
    end,
  }: {
    orientation?: 'horizontal' | 'vertical'
    position?: number
    ratio?: number
    class?: string
    style?: string
    /** Accessible name of the divider (a focusable separator). */
    dividerLabel?: string
    start?: Snippet
    end?: Snippet
  } = $props()

  let dragging = false
  let containerEl: HTMLElement

  const isH = $derived(orientation === 'horizontal')

  function getMinMax(): [number, number] {
    const cs = getComputedStyle(containerEl)
    const minPct = parseFloat(cs.getPropertyValue('--divider-min-position') || '0')
    const maxPct = parseFloat(cs.getPropertyValue('--divider-max-position') || '100')
    return [minPct / 100, maxPct / 100]
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    const rect = containerEl.getBoundingClientRect()
    const raw = isH
      ? (e.clientX - rect.left) / rect.width
      : (e.clientY - rect.top) / rect.height
    const [min, max] = getMinMax()
    ratio = Math.max(min, Math.min(max, raw))
  }

  function onPointerUp() {
    dragging = false
  }

  // The divider is a focusable separator: arrow keys move it 5% at a time
  // (Left/Up shrink the first pane, Right/Down grow it), Home/End jump to
  // the limits.
  function onKeyDown(e: KeyboardEvent) {
    const [min, max] = getMinMax()
    const back = isH ? 'ArrowLeft' : 'ArrowUp'
    const forward = isH ? 'ArrowRight' : 'ArrowDown'
    let next: number | null = null
    if (e.key === back) next = ratio - 0.05
    else if (e.key === forward) next = ratio + 0.05
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    ratio = Math.max(min, Math.min(max, next))
  }
</script>

<div
  bind:this={containerEl}
  class={['split-pane', isH ? 'horizontal' : 'vertical', className].filter(Boolean).join(' ')}
  {style}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <div class="split-start" style={isH ? `width: ${ratio * 100}%` : `height: ${ratio * 100}%`}>
    {@render start?.()}
  </div>
  <!-- A focusable separator with a value is an interactive widget (ARIA), which Svelte's role table doesn't know. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
  <div
    class="split-divider"
    role="separator"
    tabindex="0"
    aria-label={dividerLabel}
    aria-orientation={isH ? 'vertical' : 'horizontal'}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(ratio * 100)}
    onpointerdown={onPointerDown}
    onkeydown={onKeyDown}
  ></div>
  <div class="split-end">
    {@render end?.()}
  </div>
</div>

<style>
  .split-pane {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .horizontal { flex-direction: row; }
  .vertical { flex-direction: column; }

  .split-start {
    flex: none;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
  .horizontal .split-start { height: 100%; }
  .vertical .split-start { width: 100%; }

  .split-end {
    flex: 1;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }

  /* Slot content should fill the pane */
  .split-start :global(> *),
  .split-end :global(> *) {
    height: 100%;
    width: 100%;
  }

  .split-divider {
    flex: none;
    position: relative;
    z-index: 1;
    touch-action: none;
  }

  .horizontal .split-divider {
    width: var(--divider-draggable-area, 13px);
    margin-left: calc((var(--divider-draggable-area, 13px) - var(--divider-width, 5px)) / -2);
    margin-right: calc((var(--divider-draggable-area, 13px) - var(--divider-width, 5px)) / -2);
    height: 100%;
    cursor: col-resize;
  }
  .vertical .split-divider {
    width: 100%;
    height: var(--divider-draggable-area, 13px);
    margin-top: calc((var(--divider-draggable-area, 13px) - var(--divider-width, 5px)) / -2);
    margin-bottom: calc((var(--divider-draggable-area, 13px) - var(--divider-width, 5px)) / -2);
    cursor: row-resize;
  }

  /* A band of the line color (--divider-width wide, 5px by default) that
     takes real space between the panes, centered in the wider draggable
     area. */
  .split-divider::after {
    content: '';
    position: absolute;
    background: var(--app-border);
    transition: background 0.15s;
  }
  .horizontal .split-divider::after {
    top: 0; bottom: 0;
    left: calc(50% - var(--divider-width, 5px) / 2);
    width: var(--divider-width, 5px);
  }
  .vertical .split-divider::after {
    left: 0; right: 0;
    top: calc(50% - var(--divider-width, 5px) / 2);
    height: var(--divider-width, 5px);
  }

  .split-divider:hover::after {
    background: var(--quiet-primary-stroke-soft);
  }

  .split-divider:focus-visible {
    outline: none;
  }
  .split-divider:focus-visible::after {
    background: var(--quiet-primary-text);
  }
</style>
