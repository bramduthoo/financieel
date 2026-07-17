import { describe, it, expect } from 'vitest'
import { resolveCappedInflow } from './resolveCappedInflow'

describe('resolveCappedInflow — canonical cases (§4.2)', () => {
  // b, M, B, r → expected received / overflow. New balance = b + received.
  const cases = [
    { balance: 190, max: 200, amount: 50, rate: 0.5, received: 30, overflow: 20 }, // partial fill + reduce
    { balance: 220, max: 200, amount: 50, rate: 0.5, received: 25, overflow: 25 }, // already over ceiling
    { balance: 190, max: 200, amount: 50, rate: 0.0, received: 10, overflow: 40 }, // hard ceiling (rate 0)
    { balance: 0,   max: 200, amount: 50, rate: 0.5, received: 50, overflow: 0  }, // below ceiling → full
  ]

  for (const c of cases) {
    it(`b=${c.balance} M=${c.max} B=${c.amount} r=${c.rate} → ${c.received}/${c.overflow}`, () => {
      const { received, overflow } = resolveCappedInflow(c)
      expect(received).toBeCloseTo(c.received, 2)
      expect(overflow).toBeCloseTo(c.overflow, 2)
    })
  }
})

describe('resolveCappedInflow — conservation & rounding', () => {
  it('received + overflow always equals the input amount exactly', () => {
    for (const c of [
      { balance: 190, max: 200, amount: 50, rate: 0.5 },
      { balance: 220, max: 200, amount: 50, rate: 0.5 },
      { balance: 190, max: 200, amount: 50, rate: 0.0 },
      { balance: 0,   max: 200, amount: 50, rate: 0.5 },
    ]) {
      const { received, overflow } = resolveCappedInflow(c)
      expect(received + overflow).toBeCloseTo(c.amount, 2)
    }
  })

  it('a fractional rate still conserves the amount within 0.005', () => {
    // At the ceiling, rate 0.3333 on 10.00 → 3.33 kept, 6.67 overflow, summing to 10.00.
    const { received, overflow } = resolveCappedInflow({ balance: 200, max: 200, amount: 10, rate: 0.3333 })
    expect(received).toBeCloseTo(3.33, 2)
    expect(overflow).toBeCloseTo(6.67, 2)
    expect(Math.abs(received + overflow - 10)).toBeLessThanOrEqual(0.005)
  })
})
