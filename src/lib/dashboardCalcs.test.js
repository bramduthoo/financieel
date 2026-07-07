import { describe, it, expect } from 'vitest'
import {
  calculateMonthMetrics, calculateMonthlyAverage, calculateMonthOutlook, getOverspentWallets,
} from './dashboardCalcs'

// These functions take an explicit month/inputs, so they are deterministic. The time-relative
// projection helpers (calculateProjectedCash, getProjectedBalanceTimeline, getOverduePayments,
// getUnderfundedWallets, historical/yearly series) key off `new Date()` and are documented in
// docs/testing-notes.md rather than asserted against a moving wall clock.

const JUNE = new Date(2026, 5, 15)
const MAY = new Date(2026, 4, 15)

describe('calculateMonthMetrics', () => {
  const incomeEntries = [
    { date: '2026-06-05', amount: 1000 },
    { date: '2026-05-20', amount: 999 }, // different month, must be excluded
  ]
  const transactions = [
    { date: '2026-06-10', type: 'debit', is_confirmed: true, amount: 200 },
    { date: '2026-06-12', type: 'debit', is_confirmed: false, amount: 50 },  // unconfirmed, excluded
    { date: '2026-06-12', type: 'credit', is_confirmed: true, amount: 500 }, // credit, not spending
  ]

  it('sums income and confirmed debit spending within the month', () => {
    const m = calculateMonthMetrics(JUNE, transactions, incomeEntries)
    expect(m.income).toBeCloseTo(1000, 2)
    expect(m.spending).toBeCloseTo(200, 2)
    expect(m.net).toBeCloseTo(800, 2)
    expect(m.savingsRate).toBeCloseTo(80, 2)
  })

  it('reports a null savings rate when there is no income', () => {
    const m = calculateMonthMetrics(JUNE, transactions, [])
    expect(m.income).toBe(0)
    expect(m.savingsRate).toBeNull()
  })
})

describe('calculateMonthlyAverage', () => {
  it('averages income/spending/net across the given months', () => {
    const incomeEntries = [
      { date: '2026-06-05', amount: 1000 },
      { date: '2026-05-05', amount: 2000 },
    ]
    const transactions = [
      { date: '2026-06-10', type: 'debit', is_confirmed: true, amount: 200 },
      { date: '2026-05-10', type: 'debit', is_confirmed: true, amount: 400 },
    ]
    const avg = calculateMonthlyAverage([JUNE, MAY], transactions, incomeEntries)
    expect(avg.income).toBeCloseTo(1500, 2)   // (1000 + 2000) / 2
    expect(avg.spending).toBeCloseTo(300, 2)  // (200 + 400) / 2
    expect(avg.net).toBeCloseTo(1200, 2)      // (800 + 1600) / 2
  })
})

describe('calculateMonthOutlook', () => {
  it('counts recurring income and cost occurrences in the month', () => {
    const incomeRecurring = [
      { name: 'Salary', amount: 2000, frequency: 'monthly', day_of_month: 1, start_date: '2026-01-01' },
    ]
    const recurringRules = [
      { name: 'Rent', amount: 500, frequency: 'monthly', day_of_month: 1, start_date: '2026-01-01' },
    ]
    const o = calculateMonthOutlook(JUNE, incomeRecurring, recurringRules)
    expect(o.income).toBeCloseTo(2000, 2)
    expect(o.costs).toBeCloseTo(500, 2)
    expect(o.projectedNet).toBeCloseTo(1500, 2)
  })
})

describe('getOverspentWallets', () => {
  it('flags variable wallets whose spending exceeds budget, ignoring other wallet types', () => {
    const wallets = [
      { id: 'v1', name: 'Fun', type: 'variable', budget: 100 },
      { id: 'f1', name: 'Rent', type: 'fixed', budget: 100 },
    ]
    const transactions = [
      { wallet_id: 'v1', type: 'debit', date: '2026-06-10', amount: 150 }, // over by 50
      { wallet_id: 'f1', type: 'debit', date: '2026-06-10', amount: 999 }, // fixed → ignored
    ]
    const over = getOverspentWallets(wallets, transactions, JUNE)
    expect(over).toHaveLength(1)
    expect(over[0].wallet.id).toBe('v1')
    expect(over[0].over).toBeCloseTo(50, 2)
  })

  it('returns nothing when a variable wallet is within budget', () => {
    const wallets = [{ id: 'v1', name: 'Fun', type: 'variable', budget: 100 }]
    const transactions = [{ wallet_id: 'v1', type: 'debit', date: '2026-06-10', amount: 40 }]
    expect(getOverspentWallets(wallets, transactions, JUNE)).toEqual([])
  })
})
