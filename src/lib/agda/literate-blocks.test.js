/// <reference types="vitest/globals" />

import {
  parseLiterateBlocks,
  blockIndexAtPos,
  truncateToBlock,
  deleteBlock,
  newMarkdownBlockText,
  newCodeBlockText,
} from './literate-blocks'

/** @param {import('./literate-blocks').LiterateBlock[]} blocks @param {string} text */
function textsOf(blocks, text) {
  return blocks.map(b => text.slice(b.from, b.to))
}

describe('parseLiterateBlocks', () => {
  it('splits leading markdown, a fenced code block, and trailing markdown', () => {
    const text = '# Title\n\n```agda\nfoo : Set\n```\n\nDone.\n'
    const blocks = parseLiterateBlocks(text)
    expect(blocks.map(b => b.type)).toEqual(['markdown', 'code', 'markdown'])
    expect(textsOf(blocks, text)).toEqual([
      '# Title\n\n',
      '```agda\nfoo : Set\n```\n',
      '\nDone.\n',
    ])
    // blocks fully cover the text with no gaps or overlaps
    expect(blocks[0].from).toBe(0)
    expect(blocks[blocks.length - 1].to).toBe(text.length)
  })

  it('handles a document that starts directly with a code block', () => {
    const text = '```agda\nfoo : Set\n```\n'
    const blocks = parseLiterateBlocks(text)
    expect(blocks).toEqual([{ type: 'code', from: 0, to: text.length }])
  })

  it('treats an unterminated trailing code fence as an open code block to EOF', () => {
    const text = 'prose\n\n```agda\nfoo : Set\n'
    const blocks = parseLiterateBlocks(text)
    expect(blocks.map(b => b.type)).toEqual(['markdown', 'code'])
    expect(blocks[1].to).toBe(text.length)
  })

  it('does not emit a zero-length markdown block between two back-to-back code blocks', () => {
    const text = '```agda\na : Set\n```\n```agda\nb : Set\n```\n'
    const blocks = parseLiterateBlocks(text)
    expect(blocks.map(b => b.type)).toEqual(['code', 'code'])
    expect(blocks[0].to).toBe(blocks[1].from)
  })

  it('returns a single markdown block for a document with no code fences', () => {
    const text = 'just some prose\nacross two lines\n'
    expect(parseLiterateBlocks(text)).toEqual([{ type: 'markdown', from: 0, to: text.length }])
  })

  it('returns an empty array for an empty document', () => {
    expect(parseLiterateBlocks('')).toEqual([])
  })
})

describe('blockIndexAtPos', () => {
  const text = '# Title\n\n```agda\nfoo : Set\n```\n\nDone.\n'
  const blocks = parseLiterateBlocks(text)

  it('resolves a position inside the leading markdown block', () => {
    expect(blockIndexAtPos(blocks, 2)).toBe(0)
  })

  it('resolves a position inside the code block', () => {
    const codeStart = blocks[1].from
    expect(blockIndexAtPos(blocks, codeStart + 3)).toBe(1)
  })

  it('attributes a position exactly at a block boundary to the following block', () => {
    expect(blockIndexAtPos(blocks, blocks[0].to)).toBe(1)
  })

  it('resolves EOF to the last block', () => {
    expect(blockIndexAtPos(blocks, text.length)).toBe(blocks.length - 1)
  })
})

describe('truncateToBlock', () => {
  const text = '# Title\n\n```agda\na : Set\n```\n\n```agda\nb : Set\n```\n\nDone.\n'
  const blocks = parseLiterateBlocks(text)

  it('is byte-identical to slicing the full text at the block boundary', () => {
    for (let i = 0; i < blocks.length; i++) {
      expect(truncateToBlock(text, blocks, i)).toBe(text.slice(0, blocks[i].to))
    }
  })

  it('never includes content from blocks after the given index', () => {
    const truncated = truncateToBlock(text, blocks, 1) // through the first code block only
    expect(truncated).not.toContain('b : Set')
    expect(truncated).toContain('a : Set')
  })

  it('returns the whole text when given the last block index', () => {
    expect(truncateToBlock(text, blocks, blocks.length - 1)).toBe(text)
  })
})

describe('deleteBlock', () => {
  const text = '# Title\n\n```agda\na : Set\n```\n\nMiddle prose.\n\n```agda\nb : Set\n```\n'

  it('removing the first of two code blocks leaves the second one intact', () => {
    const blocks = parseLiterateBlocks(text)
    const codeBlockIndex = blocks.findIndex(b => b.type === 'code')
    const after = deleteBlock(text, blocks, codeBlockIndex)
    const afterBlocks = parseLiterateBlocks(after)
    expect(afterBlocks.map(b => b.type)).toEqual(['markdown', 'code'])
    expect(after).not.toContain('a : Set')
    expect(after).toContain('Middle prose.')
    expect(after).toContain('b : Set')
  })

  it('removing a markdown block leaves exactly the other blocks, still valid fences', () => {
    const blocks = parseLiterateBlocks(text)
    const middleMarkdownIndex = blocks.findIndex(b => b.type === 'markdown' && text.slice(b.from, b.to).includes('Middle prose'))
    const after = deleteBlock(text, blocks, middleMarkdownIndex)
    const afterBlocks = parseLiterateBlocks(after)
    expect(afterBlocks.map(b => b.type)).toEqual(['markdown', 'code', 'code'])
    expect(after).not.toContain('Middle prose')
    expect(after).toContain('a : Set')
    expect(after).toContain('b : Set')
  })

  it('returns the text unchanged for an out-of-range index', () => {
    const blocks = parseLiterateBlocks(text)
    expect(deleteBlock(text, blocks, 99)).toBe(text)
  })
})

describe('newMarkdownBlockText / newCodeBlockText', () => {
  it('newMarkdownBlockText selects the placeholder text for immediate overwrite', () => {
    const { text, selectionFrom, selectionTo } = newMarkdownBlockText()
    expect(text.slice(selectionFrom, selectionTo)).toBe('_new block_')
  })

  it('newCodeBlockText places a plain cursor on the blank interior line', () => {
    const { text, selectionFrom, selectionTo } = newCodeBlockText()
    expect(selectionFrom).toBe(selectionTo)
    expect(text.slice(0, selectionFrom)).toBe('\n\n```agda\n')
    expect(text.slice(selectionFrom)).toBe('\n```\n\n')
  })

  it('inserting newMarkdownBlockText after an existing block parses as a new markdown block', () => {
    const before = '```agda\na : Set\n```\n'
    const combined = before + newMarkdownBlockText().text
    const blocks = parseLiterateBlocks(combined)
    expect(blocks.map(b => b.type)).toEqual(['code', 'markdown'])
  })

  it('inserting newCodeBlockText after existing prose parses as markdown, then the new code block', () => {
    const before = 'some prose\n'
    const combined = before + newCodeBlockText().text
    const blocks = parseLiterateBlocks(combined)
    // newCodeBlockText's own trailing "\n\n" becomes a (blank) markdown
    // block after the code fence -- expected, matches how the parser
    // treats any trailing non-fence text, blank or not.
    expect(blocks.map(b => b.type)).toEqual(['markdown', 'code', 'markdown'])
  })
})
