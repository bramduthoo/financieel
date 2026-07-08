import { describe, it, expect } from 'vitest'
import { resolveDistribution, resolveRowExact } from './resolveDistribution'

const UNALLOC = 'unalloc-1'

// Convenience: map the resolved distributions to { wallet_id: amount } for readable assertions.
function byWallet(distributions) {
  const out = {}
  for (const d of distributions) out[d.wallet_id] = (out[d.wallet_id] ?? 0) + d.amount
  return out
}

describe('resolveRowExact — the shared per-item primitive', () => {
  it('resolves euro rows as literal euros', () => {
    expect(resolveRowExact('euro', 30, 100)).toBe(30)
  })
  it('resolves percent rows as % of the base (unrounded)', () => {
    expect(resolveRowExact('percent', 60, 100)).toBeCloseTo(60, 10)
    expect(resolveRowExact('percent', 33.33, 100)).toBeCloseTo(33.33, 10)
  })
  it('returns 0 for zero/negative/empty values', () => {
    expect(resolveRowExact('euro', 0, 100)).toBe(0)
    expect(resolveRowExact('percent', -5, 100)).toBe(0)
    expect(resolveRowExact('euro', undefined, 100)).toBe(0)
  })
})

describe('resolveDistribution — percentages are % of the TOTAL, never the remainder', () => {
  it('resolves each percent row against the full total', () => {
    const rows = [
      { wallet_id: 'w1', mode: 'percent', value: 60 },
      { wallet_id: 'w2', mode: 'percent', value: 40 },
    ]
    const { distributions } = resolveDistribution(rows, 100, {})
    // 60% and 40% of the TOTAL 100 → 60 and 40. Remainder-based would give w2 = 40% of 40 = 16.
    expect(byWallet(distributions)).toEqual({ w1: 60, w2: 40 })
  })

  it('resolves a mixed euro/% split against the total', () => {
    const rows = [
      { wallet_id: 'w1', mode: 'percent', value: 70 },
      { wallet_id: 'w2', mode: 'euro', value: 30 },
    ]
    const { distributions } = resolveDistribution(rows, 100, {})
    expect(byWallet(distributions)).toEqual({ w1: 70, w2: 30 })
  })
})

describe('resolveDistribution — remainder sweep', () => {
  it('fills exactly total minus distributed into the Unallocated wallet', () => {
    const rows = [{ wallet_id: 'w1', mode: 'euro', value: 30 }]
    const r = resolveDistribution(rows, 100, { sendRemainder: true, unallocatedWalletId: UNALLOC })

    expect(r.remainder).toBeCloseTo(70, 2)
    expect(r.remainderRow).toEqual({ wallet_id: UNALLOC, mode: 'euro', value: 70, amount: 70 })
    // distributions include the sweep and sum to the full total.
    expect(r.distributions.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(100, 2)
    expect(byWallet(r.distributions)).toEqual({ w1: 30, [UNALLOC]: 70 })
  })

  it('does not add a sweep row when the distribution is already complete', () => {
    const rows = [{ wallet_id: 'w1', mode: 'euro', value: 100 }]
    const r = resolveDistribution(rows, 100, { sendRemainder: true, unallocatedWalletId: UNALLOC })
    expect(r.remainderRow).toBeNull()
    expect(r.allRows).toHaveLength(1)
  })

  it('does not sweep when sendRemainder is off, even with a shortfall', () => {
    const rows = [{ wallet_id: 'w1', mode: 'euro', value: 30 }]
    const r = resolveDistribution(rows, 100, { sendRemainder: false, unallocatedWalletId: UNALLOC })
    expect(r.remainderRow).toBeNull()
    expect(r.remainder).toBeCloseTo(70, 2) // remainder is still reported for the UI
  })
})

describe('resolveDistribution — strict-mode sum equality flags', () => {
  it('is complete and not over when the split sums exactly to the total', () => {
    const rows = [
      { wallet_id: 'w1', mode: 'euro', value: 40 },
      { wallet_id: 'w2', mode: 'euro', value: 60 },
    ]
    const r = resolveDistribution(rows, 100, {})
    expect(r.complete).toBe(true)
    expect(r.notOver).toBe(true)
  })

  it('is not complete when the split under-fills the total', () => {
    const r = resolveDistribution([{ wallet_id: 'w1', mode: 'euro', value: 90 }], 100, {})
    expect(r.complete).toBe(false)
    expect(r.notOver).toBe(true)
  })

  it('flags over-allocation when the split exceeds the total', () => {
    const r = resolveDistribution([{ wallet_id: 'w1', mode: 'euro', value: 110 }], 100, {})
    expect(r.notOver).toBe(false)
    expect(r.complete).toBe(false)
  })
})

describe('resolveDistribution — rounding conservation within 0.005', () => {
  it('thirds split with a sweep still conserves the total', () => {
    // 33.33% + 33.33% of 100 → 33.33 + 33.33 = 66.66; sweep fills the remaining 33.34.
    const rows = [
      { wallet_id: 'w1', mode: 'percent', value: 33.33 },
      { wallet_id: 'w2', mode: 'percent', value: 33.33 },
    ]
    const r = resolveDistribution(rows, 100, { sendRemainder: true, unallocatedWalletId: UNALLOC })
    expect(r.distributed).toBeCloseTo(66.66, 2)
    expect(r.remainder).toBeCloseTo(33.34, 2)
    const grandTotal = r.distributions.reduce((s, d) => s + d.amount, 0)
    expect(Math.abs(grandTotal - 100)).toBeLessThanOrEqual(0.005)
  })

  it('rounds each resolved amount to cents', () => {
    // 33.335% of 100 = 33.335 → rounds to 33.34 (round-half behaviour of toFixed on this value).
    const r = resolveDistribution([{ wallet_id: 'w1', mode: 'percent', value: 33.335 }], 100, {})
    expect(r.explicit[0].amount).toBeCloseTo(33.34, 2)
  })
})

describe('resolveDistribution — Unallocated as a normal row', () => {
  it('treats an explicit Unallocated row as an ordinary target when the sweep is off', () => {
    const rows = [
      { wallet_id: 'w1', mode: 'euro', value: 40 },
      { wallet_id: UNALLOC, mode: 'euro', value: 60 },
    ]
    const r = resolveDistribution(rows, 100, { sendRemainder: false, unallocatedWalletId: UNALLOC })
    expect(r.remainderRow).toBeNull()
    expect(byWallet(r.distributions)).toEqual({ w1: 40, [UNALLOC]: 60 })
  })

  it('lets an explicit Unallocated row and the sweep coexist (two entries for the wallet)', () => {
    // Unallocated explicitly assigned 20, plus a swept remainder of 40 → two separate rows.
    const rows = [
      { wallet_id: 'w1', mode: 'euro', value: 40 },
      { wallet_id: UNALLOC, mode: 'euro', value: 20 },
    ]
    const r = resolveDistribution(rows, 100, { sendRemainder: true, unallocatedWalletId: UNALLOC })
    const unallocEntries = r.allRows.filter(x => x.wallet_id === UNALLOC)
    expect(unallocEntries).toHaveLength(2)
    // Total to Unallocated across both entries = 20 explicit + 40 sweep.
    expect(byWallet(r.distributions)[UNALLOC]).toBeCloseTo(60, 2)
    expect(r.distributions.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(100, 2)
  })
})

describe('resolveDistribution — guards', () => {
  it('skips zero and negative rows', () => {
    const rows = [
      { wallet_id: 'w1', mode: 'euro', value: 0 },
      { wallet_id: 'w2', mode: 'percent', value: -10 },
      { wallet_id: 'w3', mode: 'euro', value: 25 },
    ]
    const r = resolveDistribution(rows, 100, {})
    expect(r.explicit).toHaveLength(1)
    expect(r.explicit[0].wallet_id).toBe('w3')
  })

  it('returns an empty distribution for no rows', () => {
    const r = resolveDistribution([], 100, {})
    expect(r.explicit).toEqual([])
    expect(r.distributions).toEqual([])
    expect(r.distributed).toBe(0)
  })

  it('preserves row order (for rule priority)', () => {
    const rows = [
      { wallet_id: 'a', mode: 'euro', value: 10 },
      { wallet_id: 'b', mode: 'euro', value: 20 },
      { wallet_id: 'c', mode: 'euro', value: 30 },
    ]
    const r = resolveDistribution(rows, 100, {})
    expect(r.explicit.map(x => x.wallet_id)).toEqual(['a', 'b', 'c'])
  })
})
