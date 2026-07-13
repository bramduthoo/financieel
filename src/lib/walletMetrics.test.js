import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import {
  walletsSummary, walletActivityThisMonth, nextPaymentDue,
} from './walletMetrics'

describe('walletsSummary', () => {
  const wallets = [
    { id: 'a', type: 'fixed',       budget_type: 'fixed-recurring', budget: 1200, balance: 1200, is_active: true },
    { id: 'b', type: 'variable',    budget_type: 'capped',          budget: 400,  balance: 260,  is_active: true },
    { id: 'c', type: 'variable',    budget_type: 'accumulating',    budget: 150,  balance: 180,  is_active: true },
    { id: 'd', type: 'investment',  budget_type: 'none',            budget: 0,    balance: 2458, is_active: true },
    { id: 'u', type: 'unallocated', budget_type: 'unallocated',     budget: 0,    balance: 340,  is_active: true, is_system: true },
  ]

  it('sums balances across every wallet including the system one', () => {
    expect(walletsSummary(wallets).totalBalance).toBe(1200 + 260 + 180 + 2458 + 340)
  })

  it('counts active wallets including the system wallet', () => {
    expect(walletsSummary(wallets).activeCount).toBe(5)
  })

  it('does not count inactive wallets', () => {
    const w = [...wallets, { id: 'x', type: 'fixed', budget_type: 'fixed-recurring', budget: 50, balance: 0, is_active: false }]
    expect(walletsSummary(w).activeCount).toBe(5)
  })

  it('budgeted/month sums only real budgeted types, excluding investment and system', () => {
    // 1200 (fixed) + 400 (capped) + 150 (accumulating); investment none + unallocated excluded
    expect(walletsSummary(wallets).budgetedPerMonth).toBe(1750)
  })

  it('reports the Unallocated balance from the system wallet', () => {
    expect(walletsSummary(wallets).unallocatedBalance).toBe(340)
  })

  it('handles an empty wallet list', () => {
    expect(walletsSummary([])).toEqual({
      totalBalance: 0, activeCount: 0, budgetedPerMonth: 0, unallocatedBalance: 0,
    })
  })
})

describe('walletActivityThisMonth', () => {
  const now = new Date(2026, 6, 13) // 13 Jul 2026
  const tx = [
    { wallet_id: 'a', type: 'credit', amount: 200, date: '2026-07-02' },
    { wallet_id: 'a', type: 'debit',  amount: 40,  date: '2026-07-10' },
    { wallet_id: 'a', type: 'debit',  amount: 15,  date: '2026-06-30' }, // previous month — excluded
    { wallet_id: 'b', type: 'credit', amount: 999, date: '2026-07-05' }, // other wallet — excluded
  ]

  it('nets credits minus debits within the current month for the wallet', () => {
    expect(walletActivityThisMonth('a', tx, now).netInflow).toBe(160)
  })

  it('counts only this-month transactions for the wallet', () => {
    expect(walletActivityThisMonth('a', tx, now).count).toBe(2)
  })

  it('returns zeroes for a wallet with no activity this month', () => {
    expect(walletActivityThisMonth('z', tx, now)).toEqual({ netInflow: 0, count: 0 })
  })
})

describe('nextPaymentDue', () => {
  const now = new Date(2026, 6, 13) // 13 Jul 2026
  const ymd = d => (d ? format(d, 'yyyy-MM-dd') : null)

  it('returns the soonest upcoming payment date across a wallet\'s rules', () => {
    const rules = [
      { wallet_id: 'a', frequency: 'monthly', day_of_month: 1,  start_date: '2026-01-01' }, // next 1 Aug
      { wallet_id: 'a', frequency: 'monthly', day_of_month: 20, start_date: '2026-01-20' }, // next 20 Jul
      { wallet_id: 'b', frequency: 'monthly', day_of_month: 5,  start_date: '2026-01-05' }, // other wallet
    ]
    expect(ymd(nextPaymentDue(rules, 'a', now))).toBe('2026-07-20')
  })

  it('returns null when the wallet has no rules', () => {
    expect(nextPaymentDue([], 'a', now)).toBeNull()
  })

  it('ignores rules that have already ended', () => {
    const rules = [{ wallet_id: 'a', frequency: 'monthly', day_of_month: 1, start_date: '2026-01-01', end_date: '2026-03-01' }]
    expect(nextPaymentDue(rules, 'a', now)).toBeNull()
  })
})
