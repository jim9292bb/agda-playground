/// <reference types="vitest/globals" />

import { ChangeSet, RangeSet, RangeValue } from '@codemirror/state'
import { mapRange, mapRanges, upsertDeco, removeExisting } from './range-utils'

class Mark extends RangeValue {
  /** @param {string} label */
  constructor(label) {
    super()
    this.label = label
  }
  /** @param {RangeValue} other */
  eq(other) {
    return other instanceof Mark && other.label === this.label
  }
}

/** @param {RangeSet<Mark>} rset */
function collect(rset) {
  /** @type {{from: number, to: number, label: string}[]} */
  const out = []
  rset.between(0, 1e9, (from, to, value) => {
    out.push({ from, to, label: value.label })
  })
  return out
}

describe('mapRange', () => {
  it('shifts a range forward through an insertion before it', () => {
    const change = ChangeSet.of({ from: 0, to: 0, insert: 'XYZ' }, 20)
    const range = new Mark('a').range(5, 10)
    const mapped = mapRange(range, change)
    expect(mapped).toMatchObject({ from: 8, to: 13 })
  })

  it('returns undefined when the range collapses (fully deleted)', () => {
    const change = ChangeSet.of({ from: 5, to: 10, insert: '' }, 20)
    const range = new Mark('a').range(5, 10)
    expect(mapRange(range, change)).toBeUndefined()
  })

  it('leaves a range after the change untouched', () => {
    const change = ChangeSet.of({ from: 0, to: 0, insert: 'X' }, 20)
    const range = new Mark('a').range(10, 15)
    const mapped = mapRange(range, change)
    expect(mapped).toMatchObject({ from: 11, to: 16 })
  })
})

describe('mapRanges', () => {
  it('returns the same array reference when the change is empty', () => {
    const change = ChangeSet.of({ from: 0, to: 0, insert: '' }, 20)
    const ranges = [new Mark('a').range(5, 10)]
    expect(mapRanges(ranges, change)).toBe(ranges)
  })

  it('maps every range and drops any that collapse', () => {
    const change = ChangeSet.of([{ from: 0, to: 0, insert: 'XX' }, { from: 15, to: 20, insert: '' }], 20)
    const ranges = [new Mark('a').range(5, 10), new Mark('b').range(15, 20)]
    const mapped = mapRanges(ranges, change)
    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toMatchObject({ from: 7, to: 12 })
  })
})

describe('upsertDeco', () => {
  it('inserts into an empty set', () => {
    const result = upsertDeco(RangeSet.empty, new Mark('a').range(5, 10))
    expect(collect(result)).toEqual([{ from: 5, to: 10, label: 'a' }])
  })

  it('merges an overlapping range with the same value into one covering both', () => {
    const initial = RangeSet.of([new Mark('a').range(5, 10)])
    const result = upsertDeco(initial, new Mark('a').range(8, 15))
    expect(collect(result)).toEqual([{ from: 5, to: 15, label: 'a' }])
  })

  it('keeps a distinct-valued overlapping range separate', () => {
    const initial = RangeSet.of([new Mark('a').range(5, 10)])
    const result = upsertDeco(initial, new Mark('b').range(8, 15))
    const ranges = collect(result).sort((x, y) => x.from - y.from)
    expect(ranges).toEqual([
      { from: 5, to: 10, label: 'a' },
      { from: 8, to: 15, label: 'b' },
    ])
  })

  it('does not touch a non-overlapping range with the same value', () => {
    const initial = RangeSet.of([new Mark('a').range(5, 10)])
    const result = upsertDeco(initial, new Mark('a').range(20, 25))
    const ranges = collect(result).sort((x, y) => x.from - y.from)
    expect(ranges).toEqual([
      { from: 5, to: 10, label: 'a' },
      { from: 20, to: 25, label: 'a' },
    ])
  })
})

describe('removeExisting', () => {
  it('filters out a range with matching bounds and equal value', () => {
    const removing = RangeSet.of([new Mark('a').range(5, 10)])
    const filter = removeExisting(removing, true)
    expect(filter(5, 10, new Mark('a'))).toBe(false)
  })

  it('keeps a range whose value differs even if bounds match', () => {
    const removing = RangeSet.of([new Mark('a').range(5, 10)])
    const filter = removeExisting(removing, true)
    expect(filter(5, 10, new Mark('b'))).toBe(true)
  })

  it('ignores value equality when checkEq is false', () => {
    const removing = RangeSet.of([new Mark('a').range(5, 10)])
    const filter = removeExisting(removing, false)
    expect(filter(5, 10, new Mark('b'))).toBe(false)
  })

  it('keeps a range whose bounds do not match', () => {
    const removing = RangeSet.of([new Mark('a').range(5, 10)])
    const filter = removeExisting(removing, true)
    expect(filter(5, 9, new Mark('a'))).toBe(true)
  })
})
