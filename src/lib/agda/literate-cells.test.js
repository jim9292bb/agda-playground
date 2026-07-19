/// <reference types="vitest/globals" />

import { parseLiterateBlocks } from './literate-blocks'
import {
  createMarkdownCell,
  createCodeCell,
  assembleDocument,
  computeCellContentOffsets,
  cellOffsetAtPos,
  cellsFromParsedBlocks,
} from './literate-cells'

describe('createMarkdownCell / createCodeCell', () => {
  it('assigns each cell a distinct id', () => {
    const a = createMarkdownCell('hello')
    const b = createCodeCell('foo : Set')
    expect(a.id).not.toBe(b.id)
    expect(a.type).toBe('markdown')
    expect(b.type).toBe('code')
    expect(a.text).toBe('hello')
    expect(b.text).toBe('foo : Set')
  })
})

describe('assembleDocument', () => {
  it('wraps code cells in synthesized fences and never touches markdown text with fence syntax', () => {
    const cells = [createMarkdownCell('# Title'), createCodeCell('foo : Set')]
    const doc = assembleDocument(cells)
    expect(doc).toBe('# Title\n\n```agda\nfoo : Set\n```\n\n')
  })

  it('produces a document parseLiterateBlocks resolves back into the same cell types in order', () => {
    const cells = [createMarkdownCell('intro'), createCodeCell('a : Set'), createMarkdownCell('more prose'), createCodeCell('b : Set')]
    const blocks = parseLiterateBlocks(assembleDocument(cells))
    // The document's own trailing "\n\n" after the last cell parses back as
    // one extra (blank) markdown block -- expected, same reasoning as
    // literate-blocks.test.js's newCodeBlockText() round-trip case.
    expect(blocks.map(b => b.type)).toEqual(['markdown', 'code', 'markdown', 'code', 'markdown'])
  })

  it('handles an empty cell array', () => {
    expect(assembleDocument([])).toBe('')
  })

  it('handles an empty code cell (blank interior)', () => {
    const doc = assembleDocument([createCodeCell('')])
    expect(doc).toBe('```agda\n\n```\n\n')
  })
})

describe('computeCellContentOffsets', () => {
  it('locates each cell\'s own content range, excluding fence wrappers', () => {
    const md = createMarkdownCell('intro')
    const code = createCodeCell('foo : Set')
    const doc = assembleDocument([md, code])
    const offsets = computeCellContentOffsets([md, code])

    expect(offsets).toHaveLength(2)
    expect(doc.slice(offsets[0].from, offsets[0].to)).toBe('intro')
    expect(doc.slice(offsets[1].from, offsets[1].to)).toBe('foo : Set')
  })

  it('is consistent for an empty cell array', () => {
    expect(computeCellContentOffsets([])).toEqual([])
  })

  it('handles consecutive code cells', () => {
    const a = createCodeCell('a : Set')
    const b = createCodeCell('b : Set')
    const doc = assembleDocument([a, b])
    const offsets = computeCellContentOffsets([a, b])
    expect(doc.slice(offsets[0].from, offsets[0].to)).toBe('a : Set')
    expect(doc.slice(offsets[1].from, offsets[1].to)).toBe('b : Set')
  })
})

describe('cellOffsetAtPos', () => {
  const md = createMarkdownCell('intro')
  const code = createCodeCell('foo : Set')
  const cells = [md, code]
  const offsets = computeCellContentOffsets(cells)

  it('resolves a position inside a cell\'s own content', () => {
    expect(cellOffsetAtPos(offsets, offsets[1].from + 2).cellId).toBe(code.id)
  })

  it('resolves a position inside the synthesized fence wrapper to the nearest cell', () => {
    // position 0 is inside CODE_FENCE_OPEN territory conceptually, but here
    // it's within the markdown cell's own leading content -- exercise the
    // *code* cell's own fence wrapper instead, which sits between the two
    // cells' content ranges.
    const betweenCells = offsets[0].to + 1 // inside the "\n\n```agda\n" gap
    const resolved = cellOffsetAtPos(offsets, betweenCells)
    expect([md.id, code.id]).toContain(resolved.cellId)
  })

  it('returns null for an empty offsets array', () => {
    expect(cellOffsetAtPos([], 0)).toBeNull()
  })

  it('resolves EOF to the last cell', () => {
    const doc = assembleDocument(cells)
    expect(cellOffsetAtPos(offsets, doc.length).cellId).toBe(code.id)
  })
})

describe('cellsFromParsedBlocks', () => {
  it('strips fence syntax from imported code blocks, leaving plain content', () => {
    const text = '# Title\n\n```agda\nfoo : Set\n```\n\nDone.\n'
    const blocks = parseLiterateBlocks(text)
    const cells = cellsFromParsedBlocks(text, blocks)

    expect(cells.map(c => c.type)).toEqual(['markdown', 'code', 'markdown'])
    expect(cells[1].text).toBe('foo : Set')
    expect(cells[1].text).not.toContain('```')
  })

  it('strips trailing blank lines from imported markdown blocks', () => {
    const text = '# Title\n\nSome prose.\n\n```agda\nfoo : Set\n```\n'
    const blocks = parseLiterateBlocks(text)
    const cells = cellsFromParsedBlocks(text, blocks)
    expect(cells[0].text).toBe('# Title\n\nSome prose.')
  })

  it('keeps all content for an unterminated trailing code fence', () => {
    const text = 'prose\n\n```agda\nfoo : Set\n'
    const blocks = parseLiterateBlocks(text)
    const cells = cellsFromParsedBlocks(text, blocks)
    expect(cells[1].type).toBe('code')
    expect(cells[1].text).toBe('foo : Set')
  })

  it('round-trips through assembleDocument back into the same block structure', () => {
    const text = '# Title\n\n```agda\na : Set\n```\n\nMiddle prose.\n\n```agda\nb : Set\n```\n'
    const blocks = parseLiterateBlocks(text)
    const cells = cellsFromParsedBlocks(text, blocks)
    const reassembled = assembleDocument(cells)
    const reparsed = parseLiterateBlocks(reassembled)

    // Same trailing-blank-markdown-block caveat as above.
    expect(reparsed.map(b => b.type)).toEqual([...blocks.map(b => b.type), 'markdown'])
    expect(reassembled).toContain('a : Set')
    expect(reassembled).toContain('b : Set')
    expect(reassembled).toContain('Middle prose.')
  })

  it('handles a document with no code fences (a single markdown cell)', () => {
    const text = 'just some prose\nacross two lines\n'
    const blocks = parseLiterateBlocks(text)
    const cells = cellsFromParsedBlocks(text, blocks)
    expect(cells).toHaveLength(1)
    expect(cells[0].type).toBe('markdown')
  })
})
