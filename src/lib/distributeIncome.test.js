import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock the Supabase client at the boundary -------------------------------------------------
// distributeIncome is a "dumb executor": its only observable behaviour is the money it moves —
// which wallet gets credited how many euros (via the increment_wallet_balance RPC) and the credit
// transaction rows it inserts. We mock supabase so we can read those movements back, then assert
// on the euro OUTCOMES (not call order or internal structure), so these tests survive a future
// migration that moves the same math into SQL or an encrypted layer.
const rpcCalls = []
const insertedRows = []

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn((fn, args) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ data: null, error: null })
    }),
    from: vi.fn(() => ({
      insert: vi.fn((rows) => {
        insertedRows.push(...rows)
        return Promise.resolve({ data: null, error: null })
      }),
    })),
  },
}))

import { distributeIncome } from './distributeIncome'

beforeEach(() => {
  rpcCalls.length = 0
  insertedRows.length = 0
})

// Total euros credited to a given wallet across all increment_wallet_balance calls — the real
// "how much money landed here" outcome.
function creditedTo(walletId) {
  return rpcCalls
    .filter(c => c.fn === 'increment_wallet_balance' && c.args.p_wallet_id === walletId)
    .reduce((sum, c) => sum + c.args.p_amount, 0)
}

const UNALLOC = 'unalloc-1'
const ENTRY_ID = 'income-entry-42'
const USER_ID = 'user-7'

// Wallet fixtures
const normalWallet = { id: 'w-normal', name: 'Groceries', budget_type: 'recurring', balance: 0, budget: 0 }
// Capped wallet: `cap_max` is the ceiling and `cap_reduction_rate` the fraction kept above it.
// `budget` is nominal plan intent only — the executor no longer reads it. `overflow_wallet_id`
// null ⇒ overflow falls back to the caller's Unallocated wallet.
function cappedWallet(overrides = {}) {
  return {
    id: 'w-capped', name: 'Buffer', budget_type: 'capped',
    balance: 0, budget: 100, cap_max: 200, cap_reduction_rate: 0.5, overflow_wallet_id: null,
    ...overrides,
  }
}

function run(distributions, wallets, isAutomated) {
  return distributeIncome({
    distributions, wallets, unallocatedWalletId: UNALLOC,
    sourceName: 'Salary', date: '2026-07-01', isAutomated,
    userId: USER_ID, incomeEntryId: ENTRY_ID,
  })
}

describe('distributeIncome — manual / template income (isAutomated = false)', () => {
  it('credits the full specified amount and ignores caps entirely', async () => {
    // Capped wallet already at its cap: a manual credit must still land in full, no overflow.
    const w = cappedWallet({ balance: 100, budget: 100 })
    await run([{ wallet_id: w.id, amount: 250 }], [w], false)

    expect(creditedTo(w.id)).toBeCloseTo(250, 2)
    expect(creditedTo(UNALLOC)).toBe(0)
  })

  it('does not apply the cap mechanic even when the wallet is above its ceiling', async () => {
    // Balance already over cap_max: a manual credit must still land in full, no reduction/overflow.
    const w = cappedWallet({ balance: 250, cap_max: 200, cap_reduction_rate: 0.3 })
    await run([{ wallet_id: w.id, amount: 80 }], [w], false)

    expect(creditedTo(w.id)).toBeCloseTo(80, 2)
    expect(creditedTo(UNALLOC)).toBe(0)
  })
})

describe('distributeIncome — automated income on a capped wallet (isAutomated = true)', () => {
  // Canonical §4.2 cases, driven through the executor. Overflow lands in Unallocated (NULL target).
  // b, M, B, r → euros the capped wallet keeps vs euros routed to overflow.
  const cases = [
    { balance: 190, cap_max: 200, amount: 50, rate: 0.5, received: 30, overflow: 20 },
    { balance: 220, cap_max: 200, amount: 50, rate: 0.5, received: 25, overflow: 25 },
    { balance: 190, cap_max: 200, amount: 50, rate: 0.0, received: 10, overflow: 40 },
    { balance: 0,   cap_max: 200, amount: 50, rate: 0.5, received: 50, overflow: 0  },
  ]

  for (const c of cases) {
    it(`b=${c.balance} M=${c.cap_max} B=${c.amount} r=${c.rate} → keeps ${c.received}, overflows ${c.overflow}`, async () => {
      const w = cappedWallet({ balance: c.balance, cap_max: c.cap_max, cap_reduction_rate: c.rate })
      await run([{ wallet_id: w.id, amount: c.amount }], [w], true)

      expect(creditedTo(w.id)).toBeCloseTo(c.received, 2)
      expect(creditedTo(UNALLOC)).toBeCloseTo(c.overflow, 2)
      // Conservation: nothing created or lost.
      expect(creditedTo(w.id) + creditedTo(UNALLOC)).toBeCloseTo(c.amount, 2)
    })
  }

  it('overflow with a NULL overflow_wallet_id falls back to Unallocated', async () => {
    const w = cappedWallet({ balance: 190, cap_max: 200, cap_reduction_rate: 0.5, overflow_wallet_id: null })
    await run([{ wallet_id: w.id, amount: 50 }], [w], true)

    expect(creditedTo(w.id)).toBeCloseTo(30, 2)
    expect(creditedTo(UNALLOC)).toBeCloseTo(20, 2)
  })

  it('overflow routes to a chosen non-capped wallet, not Unallocated', async () => {
    const w = cappedWallet({ balance: 190, cap_max: 200, cap_reduction_rate: 0.5, overflow_wallet_id: normalWallet.id })
    await run([{ wallet_id: w.id, amount: 50 }], [w, normalWallet], true)

    expect(creditedTo(w.id)).toBeCloseTo(30, 2)
    expect(creditedTo(normalWallet.id)).toBeCloseTo(20, 2)
    expect(creditedTo(UNALLOC)).toBe(0)
  })

  it('a fractional rate still conserves the amount within 0.005', async () => {
    // At the ceiling, rate 0.3333 on 10.00 → 3.33 kept, 6.67 overflow, summing to 10.00.
    const w = cappedWallet({ balance: 200, cap_max: 200, cap_reduction_rate: 0.3333 })
    await run([{ wallet_id: w.id, amount: 10 }], [w], true)

    expect(creditedTo(w.id)).toBeCloseTo(3.33, 2)
    expect(creditedTo(UNALLOC)).toBeCloseTo(6.67, 2)
    expect(Math.abs(creditedTo(w.id) + creditedTo(UNALLOC) - 10)).toBeLessThanOrEqual(0.005)
  })

  it('a non-capped automated wallet is credited in full', async () => {
    await run([{ wallet_id: normalWallet.id, amount: 120 }], [normalWallet], true)

    expect(creditedTo(normalWallet.id)).toBeCloseTo(120, 2)
    expect(creditedTo(UNALLOC)).toBe(0)
  })
})

describe('distributeIncome — transaction rows', () => {
  it('inserts exactly one credit transaction per credit, each stamped with income_entry_id', async () => {
    // A capped credit that both fills and overflows produces two credits (wallet + overflow) → two rows.
    const w = cappedWallet({ balance: 190, cap_max: 200, cap_reduction_rate: 0.5 })
    await run([{ wallet_id: w.id, amount: 50 }], [w], true)

    expect(insertedRows).toHaveLength(2)
    for (const row of insertedRows) {
      expect(row.type).toBe('credit')
      expect(row.income_entry_id).toBe(ENTRY_ID)
      expect(row.user_id).toBe(USER_ID)
      expect(row.is_confirmed).toBe(true)
    }
    // The row amounts equal the credited euros (outcome, not call order).
    const rowTotal = insertedRows.reduce((s, r) => s + r.amount, 0)
    expect(rowTotal).toBeCloseTo(50, 2)
  })

  it('a null incomeEntryId is stamped as null on every row (older/unthreaded path)', async () => {
    await distributeIncome({
      distributions: [{ wallet_id: normalWallet.id, amount: 30 }],
      wallets: [normalWallet], unallocatedWalletId: UNALLOC,
      sourceName: 'Salary', date: '2026-07-01', isAutomated: false, userId: USER_ID,
      // incomeEntryId omitted → defaults to null
    })
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].income_entry_id).toBeNull()
  })
})

describe('distributeIncome — guards', () => {
  it('skips zero and negative amounts (no credits, no rows)', async () => {
    await run([
      { wallet_id: normalWallet.id, amount: 0 },
      { wallet_id: normalWallet.id, amount: -5 },
    ], [normalWallet], false)

    expect(creditedTo(normalWallet.id)).toBe(0)
    expect(insertedRows).toHaveLength(0)
  })

  it('skips a distribution whose wallet is not in the wallets list', async () => {
    await run([{ wallet_id: 'ghost', amount: 100 }], [normalWallet], false)

    expect(rpcCalls).toHaveLength(0)
    expect(insertedRows).toHaveLength(0)
  })
})
