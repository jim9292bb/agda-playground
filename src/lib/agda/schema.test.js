/// <reference types="vitest/globals" />

import {
  alsDefinitionSiteSchema,
  alsHighlightingInfoSchema,
  alsHighlightingInfosDirectSchema,
  alsInteractionPointsSchema,
} from './schema'

describe('alsDefinitionSiteSchema', () => {
  it('decodes a [filepath, position] tuple into a named object', () => {
    expect(alsDefinitionSiteSchema.decode(['/source.agda', 42])).toEqual({
      filepath: '/source.agda',
      position: 42,
    })
  })
})

describe('alsHighlightingInfoSchema', () => {
  it('decodes a token-based highlighting entry with a definition site', () => {
    const result = alsHighlightingInfoSchema.decode([
      10, 20, ['keyword'], true, 'a note', ['/source.agda', 5],
    ])
    expect(result).toEqual({
      range: [10, 20],
      definitionSite: { filepath: '/source.agda', position: 5 },
      atoms: ['keyword'],
      tokenBased: 'TokenBased',
      note: 'a note',
    })
  })

  it('maps the ALS boolean flag to TokenBased/NotOnlyTokenBased', () => {
    expect(alsHighlightingInfoSchema.decode([0, 1, [], true, '', null]).tokenBased).toBe('TokenBased')
    expect(alsHighlightingInfoSchema.decode([0, 1, [], false, '', null]).tokenBased).toBe('NotOnlyTokenBased')
  })

  it('allows a null definition site', () => {
    const result = alsHighlightingInfoSchema.decode([0, 1, ['comment'], false, '', null])
    expect(result.definitionSite).toBeNull()
  })
})

describe('alsHighlightingInfosDirectSchema', () => {
  it('decodes a HighlightingInfo payload, mapping keep to !remove', () => {
    const entry = [0, 1, ['comment'], false, '', null]
    const result = alsHighlightingInfosDirectSchema.decode([true, [entry]])
    expect(result.kind).toBe('HighlightingInfo')
    expect(result.direct).toBe(true)
    expect(result.info.remove).toBe(false)
    expect(result.info.payload).toHaveLength(1)
  })

  it('sets remove to true when keep is false', () => {
    const result = alsHighlightingInfosDirectSchema.decode([false, []])
    expect(result.info.remove).toBe(true)
    expect(result.info.payload).toEqual([])
  })
})

describe('alsInteractionPointsSchema', () => {
  it('decodes an array of integer interaction point ids', () => {
    expect(alsInteractionPointsSchema.decode([0, 1, 2])).toEqual([0, 1, 2])
  })

  it('decodes an empty array', () => {
    expect(alsInteractionPointsSchema.decode([])).toEqual([])
  })

  it('rejects non-integer entries', () => {
    expect(() => alsInteractionPointsSchema.decode([1.5])).toThrow()
  })
})
