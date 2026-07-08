import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase boundary. firePlan resolves a plan's items to euros and moves the money via the
// distribute_from_unallocated RPC; we capture that call to read the resolved euro split back out.
const rpcCalls = []
let rpcError = null

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn((fn, args) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ data: null, error: rpcError })
    }),
  },
  getCurrentUserId: vi.fn(() => Promise.resolve('user-7')),
}))

import { planAmount, firePlan } from './unallocatedPlans'

beforeEach(() => {
  rpcCalls.length = 0
  rpcError = null
})

// The distributions actually sent to the move RPC — the resolved euro outcome of a plan firing.
function lastDistributions() {
  const call = rpcCalls.find(c => c.fn === 'distribute_from_unallocated')
  return call ? call.args.p_distributions : null
}

describe('planAmount — how much a plan would distribute at a balance', () => {
  it('amount_over_threshold distributes the balance above the threshold', () => {
    const plan = { distribute_mode: 'amount_over_threshold', threshold: 100 }
    expect(planAmount(plan, 150)).toBeCloseTo(50, 2)
  })

  it('fixed_amount distributes exactly its configured amount when affordable', () => {
    const plan = { distribute_mode: 'fixed_amount', threshold: 100, distribute_amount: 30 }
    expect(planAmount(plan, 150)).toBeCloseTo(30, 2)
  })

  it('full_balance distributes the entire balance', () => {
    const plan = { distribute_mode: 'full_balance', threshold: 100 }
    expect(planAmount(plan, 150)).toBeCloseTo(150, 2)
  })

  it('is NOT eligible (0) when balance is below the threshold', () => {
    const plan = { distribute_mode: 'full_balance', threshold: 100 }
    expect(planAmount(plan, 90)).toBe(0)
  })

  it('is NOT eligible (0) when balance exactly equals the threshold for amount_over_threshold', () => {
    // balance - threshold = 0, which is not > 0.
    const plan = { distribute_mode: 'amount_over_threshold', threshold: 100 }
    expect(planAmount(plan, 100)).toBe(0)
  })

  it('is NOT eligible (0) when a fixed amount exceeds the available balance', () => {
    const plan = { distribute_mode: 'fixed_amount', threshold: 100, distribute_amount: 200 }
    expect(planAmount(plan, 150)).toBe(0)
  })

  it('returns 0 for an unknown distribute_mode', () => {
    expect(planAmount({ distribute_mode: 'nonsense', threshold: 0 }, 500)).toBe(0)
  })
})

describe('firePlan — percentages resolve as % of the TOTAL amount, never of the remainder', () => {
  it('resolves each percent item against the full amount (not the running remainder)', async () => {
    // amount_over_threshold at balance 200, threshold 100 → amount = 100.
    const plan = {
      name: 'Split', distribute_mode: 'amount_over_threshold', threshold: 100,
      unallocated_plan_items: [
        { wallet_id: 'w1', mode: 'percent', value: 60 },
        { wallet_id: 'w2', mode: 'percent', value: 40 },
      ],
    }
    const ok = await firePlan('unalloc-1', plan, 200)
    expect(ok).toBe(true)

    const dists = lastDistributions()
    // 60% and 40% of the TOTAL 100 → 60 and 40. If it were % of the remainder, w2 would be
    // 40% of (100 - 60) = 16, so 40 here is the proof that % is of the total input.
    expect(dists).toEqual([
      { wallet_id: 'w1', amount: 60 },
      { wallet_id: 'w2', amount: 40 },
    ])
  })

  it('resolves euro items as literal euros regardless of the amount', async () => {
    const plan = {
      name: 'Literal', distribute_mode: 'full_balance', threshold: 0,
      unallocated_plan_items: [
        { wallet_id: 'w1', mode: 'euro', value: 30 },
        { wallet_id: 'w2', mode: 'euro', value: 70 },
      ],
    }
    await firePlan('unalloc-1', plan, 100)
    expect(lastDistributions()).toEqual([
      { wallet_id: 'w1', amount: 30 },
      { wallet_id: 'w2', amount: 70 },
    ])
  })

  it('handles a mixed percent + euro split that fully allocates the amount', async () => {
    // amount = 100: 70% (=70) + euro 30 = 100.
    const plan = {
      name: 'Mixed', distribute_mode: 'full_balance', threshold: 0,
      unallocated_plan_items: [
        { wallet_id: 'w1', mode: 'percent', value: 70 },
        { wallet_id: 'w2', mode: 'euro', value: 30 },
      ],
    }
    const ok = await firePlan('unalloc-1', plan, 100)
    expect(ok).toBe(true)
    expect(lastDistributions()).toEqual([
      { wallet_id: 'w1', amount: 70 },
      { wallet_id: 'w2', amount: 30 },
    ])
  })
})

describe('firePlan — guards against mis-distribution', () => {
  it('does not fire (returns false, no RPC) when the split under-allocates the amount', async () => {
    // amount = 100 but items only cover 50 → the defensive guard skips it.
    const plan = {
      name: 'Partial', distribute_mode: 'full_balance', threshold: 0,
      unallocated_plan_items: [{ wallet_id: 'w1', mode: 'percent', value: 50 }],
    }
    const ok = await firePlan('unalloc-1', plan, 100)
    expect(ok).toBe(false)
    expect(lastDistributions()).toBeNull()
  })

  it('does not fire when the plan is not eligible at this balance', async () => {
    const plan = {
      name: 'TooLow', distribute_mode: 'amount_over_threshold', threshold: 100,
      unallocated_plan_items: [{ wallet_id: 'w1', mode: 'percent', value: 100 }],
    }
    const ok = await firePlan('unalloc-1', plan, 80) // below threshold → amount 0
    expect(ok).toBe(false)
    expect(rpcCalls).toHaveLength(0)
  })

  it('reports failure when the move RPC returns an error', async () => {
    rpcError = { message: 'boom' }
    const plan = {
      name: 'Erring', distribute_mode: 'full_balance', threshold: 0,
      unallocated_plan_items: [{ wallet_id: 'w1', mode: 'percent', value: 100 }],
    }
    const ok = await firePlan('unalloc-1', plan, 100)
    expect(ok).toBe(false)
  })
})
