<script>
import HeaderExamplePicker from '$lib/components/HeaderExamplePicker.svelte'
import NotebookPage from '$lib/components/NotebookPage.svelte'

/** @param {string} code */
function wrapAsLiterate(code) {
  return `\`\`\`agda\n${code}\`\`\`\n`
}

const defaultSource = `# Agda Notebook

A Jupyter-style notebook for Agda: this document is a sequence of
independent prose and \`\`\`agda\`\`\` cells. Running a command while the
cursor is in a code cell only sends Agda everything up to and including
that cell.

Use **+ Markdown** / **+ Code** above to add cells, and hover a cell to
reveal a delete button. **Open** / **Export** read and write a whole
\`.lagda.md\` file. Markdown cells also render math, e.g.
$\\sum_{i=0}^n i = \\frac{n(n+1)}{2}$.

${wrapAsLiterate('{-# OPTIONS --cubical --guardedness #-}\n\nopen import Cubical.Foundations.Prelude\n')}`

const scratchpadExamples = [
  {
    id: 'cubical-prelude',
    label: 'Cubical Prelude',
    description: 'Minimal Cubical Agda import.',
    source: defaultSource,
  },
  {
    id: 'nat-basics',
    label: 'Nat basics',
    description: 'Define a small natural number datatype.',
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

one : N
one = s z
`),
  },
  {
    id: 'case-split-plus',
    label: 'Case split practice',
    description: 'Practice C-c C-c on the first argument.',
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
a + b = ?
`),
  },
  {
    id: 'auto-identity',
    label: 'Auto practice',
    description: 'Practice C-c C-a in a simple goal.',
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! !}
`),
  },
  {
    id: 'refine-elaborate',
    label: 'Refine / elaborate',
    description: 'Practice C-c C-r or C-c C-m with an expression.',
    source: wrapAsLiterate(`data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! n !}
`),
  },
  {
    id: 'query-bool',
    label: 'Query practice',
    description: 'Practice infer, compute, module contents, and why-in-scope.',
    source: wrapAsLiterate(`open import Agda.Builtin.Bool

test : Bool
test = true
`),
  },
  {
    id: 'stdlib-nat',
    label: 'standard-library Nat',
    description: 'Minimal standard-library import.',
    source: wrapAsLiterate('open import Data.Nat.Base\n'),
  },
  {
    id: 'literate-blocks-demo',
    label: 'Multiple blocks demo',
    description: 'Two code blocks separated by prose — try running a command from the first block.',
    source: `# Two-block demo

First block:

${wrapAsLiterate('data N : Set where\n  z : N\n  s : N -> N\n')}
Second block (defines something the first block cannot see):

${wrapAsLiterate('one : N\none = s z\n')}`,
  },
]

let selectedExampleId = $state('cubical-prelude')
/** @type {NotebookPage | undefined} */
let notebook = $state()

/** @param {string} exampleId */
function selectScratchpadExample(exampleId) {
  selectedExampleId = exampleId
  const example = scratchpadExamples.find(example => example.id === exampleId)
  if (example) notebook?.loadSource(example.source)
}
</script>

<NotebookPage
  bind:this={notebook}
  title="Agda Notebook"
  appSwitcherCurrent="notebook"
  storageNamespace="literate"
  sourceFileName="source.lagda.md"
  {defaultSource}>
  {#snippet picker()}
    <HeaderExamplePicker examples={scratchpadExamples} {selectedExampleId} onSelect={selectScratchpadExample} />
  {/snippet}
</NotebookPage>
