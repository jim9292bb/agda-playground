<script>
import { onMount } from 'svelte'
import { afterNavigate, replaceState } from '$app/navigation'
import PlfaChapterPicker from '$lib/components/PlfaChapterPicker.svelte'
import NotebookPage from '$lib/components/NotebookPage.svelte'
import { deployProfiles } from '$lib/controller.svelte'
import { GENERATED_PLFA_CHAPTERS } from '../../../scripts/generated-plfa-chapters.mjs'

// Chapters have real cross-module dependencies (e.g. part2 imports part1)
// resolved via the `plfa` library mounted in this profile -- see
// deploy.config.json's "Standard Library v2.1.1 + PLFA (ALS 2.7.0.1)" entry.
// PLFA's own README pins Agda v2.7.0 + stdlib v2.1, but that exact stdlib
// snapshot fails to type-check under the whole Agda 2.7.x line (confirmed
// against both 2.7.0 and 2.7.0.1) in Data.Integer.Tactic.RingSolver, a
// module PLFA itself never imports -- stdlib v2.1.1 fixes that module
// while remaining otherwise compatible, so it's used here instead.
// Which profile counts as "the PLFA profile" is marked by deploy.config.json's
// own `plfa: true` field on that profile -- not by matching a specific label
// string, since a label is just display text a deployer is free to reword.
// AppSwitcher.svelte checks the same field to decide whether to show a
// "PLFA" link at all.
const plfaProfile = deployProfiles.find(p => p.plfa === true)

const defaultSource = `# PLFA Notebook

An interactive, editable notebook for *Programming Language Foundations in
Agda* (PLFA). Pick a chapter from **Chapters** above to load it: each
chapter's own \`module plfa.partN.Xxx where\` header is stripped so it loads
as this notebook's own top-level document, with the rest of the book
mounted as a read-only library so \`open import plfa.part1.Xxx\`-style
cross-chapter references resolve normally. Editing a chapter here never
changes what other chapters see when they import it.
`

/** @typedef {{ part: string, id: string, title: string, source: string }} PlfaChapter */
/** @type {PlfaChapter[]} */
const plfaChapters = GENERATED_PLFA_CHAPTERS

let selectedChapterId = $state(/** @type {string | null} */(null))
/** @type {NotebookPage | undefined} */
let notebook = $state()

// Each chapter keeps its own saved copy (NotebookPage.openScopedSource), so
// a student's exercise answers survive switching chapters, reloading, and
// opening a ?chapter= link again. The last chapter is remembered for a plain
// /plfa visit, and the URL follows the open chapter.
const LS_LAST_CHAPTER_KEY = 'agda-playground-plfa.last-chapter.v1'

let routerReady = false

/** Put the open chapter in the URL (?chapter=), once SvelteKit's router can
 *  take a replaceState: the first chapter is picked during mount, before it. */
function syncChapterUrl() {
  if (!routerReady) return
  const url = new URL(window.location.href)
  if (selectedChapterId) url.searchParams.set('chapter', selectedChapterId)
  else url.searchParams.delete('chapter')
  if (url.href !== window.location.href) replaceState(url, {})
}

afterNavigate(() => {
  routerReady = true
  syncChapterUrl()
})

/** @param {string | null} id */
function rememberChapter(id) {
  try {
    if (id) localStorage.setItem(LS_LAST_CHAPTER_KEY, id)
    else localStorage.removeItem(LS_LAST_CHAPTER_KEY)
  } catch {
    // storage blocked: the chapter just isn't remembered
  }
  syncChapterUrl()
}

/** @param {PlfaChapter} chapter */
function selectPlfaChapter(chapter) {
  selectedChapterId = chapter.id
  notebook?.openScopedSource(chapter.id, chapter.source)
  rememberChapter(chapter.id)
}

/** @param {PlfaChapter} chapter */
function resetPlfaChapter(chapter) {
  if (!window.confirm(`Replace your work in "${chapter.title}" with the original chapter? This cannot be undone.`)) return
  selectedChapterId = chapter.id
  notebook?.openScopedSource(chapter.id, chapter.source, { what: 'Original chapter', fresh: true })
  rememberChapter(chapter.id)
}

// Deep-link support: ?chapter=<id> (e.g. ?chapter=Naturals) opens straight
// into that chapter, mirroring plfa.github.io's own per-chapter URLs so a
// link from the official site or course material can point directly at the
// interactive version. Without one, the last chapter opened here reopens.
// An unknown id is ignored, leaving the default welcome content. Children
// mount before their parent, so `notebook` is already bound by the time
// this runs.
onMount(() => {
  let chapterId = new URL(window.location.href).searchParams.get('chapter')
  if (!chapterId) {
    try {
      chapterId = localStorage.getItem(LS_LAST_CHAPTER_KEY)
    } catch {
      chapterId = null
    }
  }
  const chapter = plfaChapters.find(c => c.id === chapterId)
  if (chapter) selectPlfaChapter(chapter)
})
</script>

<NotebookPage
  bind:this={notebook}
  title="PLFA Notebook"
  appSwitcherCurrent="plfa"
  storageNamespace="plfa"
  sourceFileName="source-plfa.lagda.md"
  initialProfileLabel={plfaProfile?.label}
  {defaultSource}
  onSourceReplaced={() => { selectedChapterId = null; rememberChapter(null) }}>
  {#snippet picker()}
    <PlfaChapterPicker chapters={plfaChapters} {selectedChapterId} onSelect={selectPlfaChapter} onReset={resetPlfaChapter} />
  {/snippet}
</NotebookPage>
