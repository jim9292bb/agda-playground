/**
 * Reads references/plfa/src/plfa/part{1,2,3}/*.lagda.md (a local, gitignored
 * sibling checkout of https://github.com/plfa/plfa.github.io -- see
 * CLAUDE.md's Reference Repositories section) and writes
 * scripts/generated-plfa-chapters.mjs: one entry per chapter, with its own
 * `module plfa.partN.Name where` declaration fence stripped (so the text is
 * loadable as a standalone top-level source file -- Agda then infers the
 * module name from the file's own basename, exactly like this app's other
 * scratch buffers already rely on) and its YAML front matter's `title`
 * turned into a markdown H1 (so the notebook shows something readable
 * instead of raw front matter).
 *
 * references/plfa is NOT part of this repo and is not fetched by any
 * existing setup script -- if it's missing (a fresh clone that hasn't
 * cloned it, or a deployer who never wants the PLFA feature), this script
 * writes an empty chapter list rather than failing, the same graceful-skip
 * convention generate-library-info.mjs uses for a missing library.
 *
 * The generated file is a plain ES module imported by the /plfa route at
 * build time (Vite inlines it into the compiled bundle). It's gitignored.
 *
 * Chapters within each part are ordered to match PLFA's own reading order
 * (data/tableOfContents.yml), not alphabetically -- e.g. part1 actually
 * reads Naturals, Induction, Relations, Equality, ... not the alphabetical
 * Connectives, Decidable, Equality, .... tableOfContents.yml also places
 * part2/Substitution.lagda.md under a separate "Appendix" section (after
 * part3 in the file) rather than inside part2's own chapter list; scanning
 * `include:` lines in the file's own top-to-bottom order and just grouping
 * by which part{1,2,3} directory each path falls under naturally lands it
 * last within part2's list, without needing to special-case it.
 *
 * Usage: node scripts/generate-plfa-chapters.mjs
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLFA_ROOT = join(REPO_ROOT, '..', 'references', 'plfa')
const PLFA_SRC = join(PLFA_ROOT, 'src', 'plfa')
const TOC_PATH = join(PLFA_ROOT, 'data', 'tableOfContents.yml')
const OUT_PATH = join(REPO_ROOT, 'scripts', 'generated-plfa-chapters.mjs')
const PARTS = ['part1', 'part2', 'part3']

/**
 * Parses `data/tableOfContents.yml`'s `include: src/plfa/partN/Xxx.lagda.md`
 * lines (in file order) into a map of part -> ordered chapter ids. Not a
 * general YAML parser -- this file's structure is simple and fixed enough
 * that adding a YAML dependency for one file isn't worth it.
 * @returns {Promise<Record<string, string[]>>}
 */
async function readChapterOrder() {
  /** @type {Record<string, string[]>} */
  const order = { part1: [], part2: [], part3: [] }
  let text
  try {
    text = await readFile(TOC_PATH, 'utf8')
  } catch {
    return order
  }
  const re = /include:\s*src\/plfa\/(part[123])\/(\S+)\.lagda\.md/g
  for (const m of text.matchAll(re)) {
    order[m[1]].push(m[2])
  }
  return order
}

/** @param {string} text @returns {{ title: string | null, body: string }} */
function stripFrontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!m) return { title: null, body: text }
  const titleMatch = /^title\s*:\s*"?(.*?)"?\s*$/m.exec(m[1])
  return { title: titleMatch?.[1] ?? null, body: text.slice(m[0].length) }
}

/** @param {string} text @returns {string} */
function stripModuleFence(text) {
  return text.replace(/```agda\nmodule plfa\.\S+ where\n```\n/, '')
}

/** @param {string} text @returns {string} */
function stripChapter(text) {
  const { title, body } = stripFrontMatter(text)
  const stripped = stripModuleFence(body)
  return title ? `# ${title}\n\n${stripped}` : stripped
}

async function exists(path) {
  try {
    await readdir(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  /** @type {{ part: string, id: string, title: string, source: string }[]} */
  const chapters = []

  if (await exists(PLFA_SRC)) {
    const order = await readChapterOrder()
    for (const part of PARTS) {
      const dir = join(PLFA_SRC, part)
      if (!(await exists(dir))) continue
      const files = (await readdir(dir)).filter(f => f.endsWith('.lagda.md'))
      const ids = files.map(f => f.replace(/\.lagda\.md$/, ''))
      // Chapters listed in tableOfContents.yml come first, in that order;
      // anything present on disk but not in the TOC (shouldn't normally
      // happen) is appended alphabetically rather than silently dropped.
      const ordered = [
        ...order[part].filter(id => ids.includes(id)),
        ...ids.filter(id => !order[part].includes(id)).sort(),
      ]
      for (const id of ordered) {
        const raw = await readFile(join(dir, `${id}.lagda.md`), 'utf8')
        const { title } = stripFrontMatter(raw)
        chapters.push({ part, id, title: title ?? id, source: stripChapter(raw) })
      }
    }
  }

  const out = `// Generated by scripts/generate-plfa-chapters.mjs — do not edit by hand.
// Re-run \`npm run setup\` (or \`node scripts/generate-plfa-chapters.mjs\`) after
// updating references/plfa.

/** @typedef {{ part: string, id: string, title: string, source: string }} PlfaChapter */

/** @type {PlfaChapter[]} */
export const GENERATED_PLFA_CHAPTERS = ${JSON.stringify(chapters, null, 2)}
`
  await writeFile(OUT_PATH, out)
  console.log(`Wrote ${chapters.length} PLFA chapters to scripts/generated-plfa-chapters.mjs`)
}

main().catch(err => { console.error(err); process.exit(1) })
