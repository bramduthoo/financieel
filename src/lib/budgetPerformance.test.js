import { describe, it, expect } from 'vitest'
import {
  getMonthWindows,
  computeWalletMonthlyActivity,
  computeBudgetPerformance,
  detectBudgetDrift,
  computeExecutionStatus,
  PERFORMANCE_WINDOW_MONTHS,
  TRAILING_MONTHS,
  DRIFT_THRESHOLD_PCT,
} from './budgetPerformance'

// Fixed clock — everything time-relative is deterministic under it (the whole point of the seam).
const NOW = new Date(2026, 6, 15) // 15 Jul 2026, local (month is 0-indexed)

// ── Wallets ────────────────────────────────────────────────────────────────
const fixed  = { id: 'w-rent',   name: 'Rent',      type: 'fixed',      budget_type: 'fixed-recurring', budget: 100, sort_order: 1 }
const accum  = { id: 'w-holiday',name: 'Holiday',   type: 'variable',   budget_type: 'accumulating',    budget: 200, sort_order: 2 }
const capped = { id: 'w-clothes',name: 'Clothing',  type: 'variable',   budget_type: 'capped',          budget: 100, sort_order: 3, cap_max: 300 }
const noBudg = { id: 'w-misc',   name: 'Misc',      type: 'variable',   budget_type: 'accumulating',    budget: 0,   sort_order: 4 }
const invest = { id: 'w-invest', name: 'Invest',    type: 'investment', budget_type: 'none',            budget: null, sort_order: 5 }
const unallo = { id: 'w-unalloc',name: 'Unallocated',type: 'unallocated',budget_type: 'unallocated',    budget: null, is_system: true, sort_order: 99 }
const WALLETS = [fixed, accum, capped, noBudg, invest, unallo]

const debit  = (wallet_id, date, amount, is_confirmed = true) => ({ wallet_id, date, amount, type: 'debit', is_confirmed })
const credit = (wallet_id, date, amount, income_entry_id) => ({ wallet_id, date, amount, type: 'credit', is_confirmed: true, income_entry_id })

describe('getMonthWindows', () => {
  it('returns the trailing calendar months oldest→newest, marking the current one', () => {
    const w = getMonthWindows({ now: NOW })
    expect(w).toHaveLength(PERFORMANCE_WINDOW_MONTHS)
    expect(w.map(m => m.key)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'])
    expect(w.at(-1).isCurrent).toBe(true)
    expect(w.slice(0, -1).every(m => !m.isCurrent)).toBe(true)
    expect(w.at(-1).label).toBe('Jul')
  })

  it('is deterministic under a fixed now', () => {
    expect(getMonthWindows({ now: NOW })).toEqual(getMonthWindows({ now: NOW }))
  })

  it('honours a custom month count', () => {
    expect(getMonthWindows({ now: NOW, months: 3 }).map(m => m.key)).toEqual(['2026-05', '2026-06', '2026-07'])
  })
})

describe('computeWalletMonthlyActivity — month boundaries', () => {
  const windows = getMonthWindows({ now: NOW })
  const incomeEntries = [{ id: 'e-jun', income_recurring_id: 'inc-1', date: '2026-06-25' }]

  it('buckets transactions on the first and last day of a month, and the days either side, correctly', () => {
    const transactions = [
      debit(fixed.id, '2026-05-31', 5),  // last day May → 2026-05
      debit(fixed.id, '2026-06-01', 10), // first day Jun → 2026-06
      debit(fixed.id, '2026-06-30', 20), // last day Jun → 2026-06
      debit(fixed.id, '2026-07-01', 40), // first day Jul → 2026-07
    ]
    const { byWallet } = computeWalletMonthlyActivity({ transactions, incomeEntries, wallets: WALLETS, windows })
    expect(byWallet[fixed.id]['2026-05'].spent).toBe(5)
    expect(byWallet[fixed.id]['2026-06'].spent).toBe(30)
    expect(byWallet[fixed.id]['2026-07'].spent).toBe(40)
  })

  it('excludes unconfirmed debits from spent', () => {
    const transactions = [debit(fixed.id, '2026-06-10', 50, false)]
    const { byWallet } = computeWalletMonthlyActivity({ transactions, incomeEntries, wallets: WALLETS, windows })
    expect(byWallet[fixed.id]?.['2026-06']?.spent ?? 0).toBe(0)
  })

  it('counts only recurring-linked credits as received, and marks the month logged', () => {
    const transactions = [
      credit(fixed.id, '2026-06-25', 100, 'e-jun'),   // recurring → received
      credit(fixed.id, '2026-06-26', 15, 'e-manual'), // manual entry (not in incomeEntries) → ignored
    ]
    const { byWallet, months } = computeWalletMonthlyActivity({ transactions, incomeEntries, wallets: WALLETS, windows })
    expect(byWallet[fixed.id]['2026-06'].received).toBe(100)
    expect(months.find(m => m.key === '2026-06').logged).toBe(true)
    expect(months.find(m => m.key === '2026-05').logged).toBe(false)
  })
})

describe('computeBudgetPerformance', () => {
  const windows = getMonthWindows({ now: NOW })
  // Recurring income logged Apr/May/Jun so those months count as "logged".
  const incomeEntries = ['2026-04-25', '2026-05-25', '2026-06-25'].map((date, i) => ({ id: `e-${i}`, income_recurring_id: 'inc-1', date }))

  function perfFor(transactions, wallets = WALLETS) {
    const activity = computeWalletMonthlyActivity({ transactions, incomeEntries, wallets, windows })
    return computeBudgetPerformance({ activity, wallets })
  }

  it('excludes free-pool, system and budget-less wallets', () => {
    const perf = perfFor([debit(noBudg.id, '2026-06-10', 10), debit(invest.id, '2026-06-10', 10)])
    const ids = perf.map(p => p.wallet.id)
    expect(ids).toContain(fixed.id)
    expect(ids).not.toContain(noBudg.id)   // budget 0
    expect(ids).not.toContain(invest.id)   // free pool
    expect(ids).not.toContain(unallo.id)   // system
  })

  it('averages spend over the trailing complete months, ignoring the partial current month', () => {
    const transactions = [
      debit(fixed.id, '2026-04-10', 90),
      debit(fixed.id, '2026-05-10', 100),
      debit(fixed.id, '2026-06-10', 110),
      debit(fixed.id, '2026-07-10', 999), // current partial month — must NOT skew the average
    ]
    const p = perfFor(transactions).find(x => x.wallet.id === fixed.id)
    expect(p.trailingAvgSpent).toBe(100)     // (90+100+110)/3
    expect(p.deviationPct).toBeCloseTo(0, 5) // budget 100
    expect(p.direction).toBe(null)
  })

  it('reports capped realized inflow separately and never misreads a throttle as spending', () => {
    // Capped wallet at ceiling: only €40 of the €100 plan landed (throttled); spent €100.
    const transactions = [
      credit(capped.id, '2026-06-25', 40, 'e-2'),
      debit(capped.id, '2026-06-10', 100),
    ]
    const activity = computeWalletMonthlyActivity({ transactions, incomeEntries, wallets: WALLETS, windows })
    const p = computeBudgetPerformance({ activity, wallets: WALLETS, plannedByWallet: { [capped.id]: 100 } })
      .find(x => x.wallet.id === capped.id)
    expect(p.perMonth.find(m => m.key === '2026-06').received).toBe(40) // realized, not the €100 plan
    expect(p.planned).toBe(100)
  })

  it('renders received as absent (null), not €0, for a month with no logged income', () => {
    const transactions = [debit(fixed.id, '2026-03-10', 50)] // Mar has no recurring income entry
    const p = perfFor(transactions).find(x => x.wallet.id === fixed.id)
    expect(p.perMonth.find(m => m.key === '2026-03').received).toBe(null)
    expect(p.perMonth.find(m => m.key === '2026-03').spent).toBe(50)
  })
})

describe('detectBudgetDrift', () => {
  const windows = getMonthWindows({ now: NOW })
  const incomeEntries = ['2026-04-25', '2026-05-25', '2026-06-25'].map((date, i) => ({ id: `e-${i}`, income_recurring_id: 'inc-1', date }))
  const flagFor = (transactions, wallets = WALLETS, thresholdPct = DRIFT_THRESHOLD_PCT) => {
    const activity = computeWalletMonthlyActivity({ transactions, incomeEntries, wallets, windows })
    const performance = computeBudgetPerformance({ activity, wallets })
    return detectBudgetDrift({ performance, thresholdPct })
  }

  it('flags a wallet consistently over budget and suggests the trailing average', () => {
    const transactions = [
      debit(fixed.id, '2026-04-10', 130),
      debit(fixed.id, '2026-05-10', 140),
      debit(fixed.id, '2026-06-10', 150),
    ]
    const flagged = flagFor(transactions)
    const f = flagged.find(x => x.wallet.id === fixed.id)
    expect(f).toBeTruthy()
    expect(f.direction).toBe('over')
    expect(f.suggestedBudget).toBe(140) // round((130+140+150)/3)
  })

  it('does NOT flag a lumpy accumulating wallet whose zero-spend months are by design', () => {
    // Holiday (budget 200): €0 for two months, €1200 once — the classic trap. Only 1 spending month.
    const transactions = [debit(accum.id, '2026-06-10', 1200)]
    const flagged = flagFor(transactions)
    expect(flagged.find(x => x.wallet.id === accum.id)).toBeUndefined()
  })

  it('does NOT flag with fewer than 3 months of spending data', () => {
    const transactions = [
      debit(fixed.id, '2026-05-10', 200),
      debit(fixed.id, '2026-06-10', 200),
    ]
    expect(flagFor(transactions)).toHaveLength(0)
  })

  it('fires when deviation is exactly at the threshold (inclusive boundary)', () => {
    // budget 100, spend 120 every month → deviation exactly +20%.
    const transactions = [
      debit(fixed.id, '2026-04-10', 120),
      debit(fixed.id, '2026-05-10', 120),
      debit(fixed.id, '2026-06-10', 120),
    ]
    const f = flagFor(transactions).find(x => x.wallet.id === fixed.id)
    expect(f).toBeTruthy()
    expect(f.deviationPct).toBeCloseTo(20, 5)
  })

  it('does NOT flag when the trailing months are not all the same direction', () => {
    // Average may exceed budget, but one month is under → not a consistent drift.
    const transactions = [
      debit(fixed.id, '2026-04-10', 200),
      debit(fixed.id, '2026-05-10', 200),
      debit(fixed.id, '2026-06-10', 50), // under budget → breaks consistency
    ]
    expect(flagFor(transactions).find(x => x.wallet.id === fixed.id)).toBeUndefined()
  })

  it('does NOT flag a wallet that has simply gone quiet (spent in older months, €0 in the trailing window)', () => {
    // Spent in Feb/Mar/Apr (passes the 3-months-of-spending gate) but nothing in the trailing
    // May/Jun — a dormant wallet, not one whose budget is genuinely too high. Must not nudge "under".
    const transactions = [
      debit(fixed.id, '2026-02-10', 200),
      debit(fixed.id, '2026-03-10', 200),
      debit(fixed.id, '2026-04-10', 200),
    ]
    expect(flagFor(transactions).find(x => x.wallet.id === fixed.id)).toBeUndefined()
  })

  it('flags a wallet consistently under budget (money tied up)', () => {
    const transactions = [
      debit(fixed.id, '2026-04-10', 40),
      debit(fixed.id, '2026-05-10', 30),
      debit(fixed.id, '2026-06-10', 50),
    ]
    const f = flagFor(transactions).find(x => x.wallet.id === fixed.id)
    expect(f.direction).toBe('under')
    expect(f.suggestedBudget).toBe(40)
  })

  it('is deterministic under a fixed now', () => {
    const transactions = [
      debit(fixed.id, '2026-04-10', 130),
      debit(fixed.id, '2026-05-10', 140),
      debit(fixed.id, '2026-06-10', 150),
    ]
    expect(flagFor(transactions)).toEqual(flagFor(transactions))
  })
})

describe('computeExecutionStatus', () => {
  const incomes = [{ id: 'inc-1', name: 'Salary', amount: 300 }]

  it('reports a logged income with its wallets-vs-free-pool split', () => {
    const incomeEntries = [{ id: 'e-jul', income_recurring_id: 'inc-1', date: '2026-07-01' }]
    const transactions = [
      credit(fixed.id, '2026-07-01', 100, 'e-jul'),
      credit(accum.id, '2026-07-01', 150, 'e-jul'),
      credit(unallo.id, '2026-07-01', 50, 'e-jul'), // free pool
    ]
    const s = computeExecutionStatus({ incomes, incomeEntries, transactions, wallets: WALLETS, now: NOW })
    expect(s.anyLogged).toBe(true)
    expect(s.allLogged).toBe(true)
    expect(s.incomes[0].date).toBe('2026-07-01')
    expect(s.receivedTotal).toBe(300)
    expect(s.toWallets).toBe(250)
    expect(s.toFreePool).toBe(50)
  })

  it('reports a not-logged income as a distinct state with zero received (never fabricated)', () => {
    const s = computeExecutionStatus({ incomes, incomeEntries: [], transactions: [], wallets: WALLETS, now: NOW })
    expect(s.anyLogged).toBe(false)
    expect(s.incomes[0].logged).toBe(false)
    expect(s.incomes[0].date).toBe(null)
    expect(s.receivedTotal).toBe(0)
  })

  it('ignores income logged in a different month', () => {
    const incomeEntries = [{ id: 'e-jun', income_recurring_id: 'inc-1', date: '2026-06-25' }]
    const transactions = [credit(fixed.id, '2026-06-25', 100, 'e-jun')]
    const s = computeExecutionStatus({ incomes, incomeEntries, transactions, wallets: WALLETS, now: NOW })
    expect(s.anyLogged).toBe(false)
    expect(s.receivedTotal).toBe(0)
  })
})

describe('constants', () => {
  it('exposes the tunables as single-home named constants', () => {
    expect(PERFORMANCE_WINDOW_MONTHS).toBe(6)
    expect(TRAILING_MONTHS).toBe(3)
    expect(DRIFT_THRESHOLD_PCT).toBe(20)
  })
})
