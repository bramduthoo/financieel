import { describe, it, expect } from 'vitest'
import { incomeSummary, recurringDueState } from './incomeMetrics'

describe('incomeSummary', () => {
  const now = new Date(2026, 6, 13) // 13 Jul 2026
  const entries = [
    { amount: 2000, date: '2026-07-10', income_recurring_id: 'r1' },
    { amount: 920,  date: '2026-07-10' },
    { amount: 192,  date: '2026-07-01' },
    { amount: 234,  date: '2026-06-28' }, // previous month
    { amount: 2800, date: '2026-06-05' }, // previous month
    { amount: 500,  date: '2025-12-20' }, // previous year
  ]

  it('totals this-month income', () => {
    expect(incomeSummary(entries, now).thisMonthTotal).toBe(2000 + 920 + 192)
  })

  it('totals the previous month and computes the delta with its label', () => {
    const s = incomeSummary(entries, now)
    expect(s.prevMonthTotal).toBe(234 + 2800)
    expect(s.deltaVsPrev).toBe((2000 + 920 + 192) - (234 + 2800))
    expect(s.prevMonthLabel).toBe('June')
  })

  it('counts entries in the current year only', () => {
    const s = incomeSummary(entries, now)
    expect(s.entryCountThisYear).toBe(5)
    expect(s.year).toBe(2026)
  })

  it('handles no entries', () => {
    const s = incomeSummary([], now)
    expect(s.thisMonthTotal).toBe(0)
    expect(s.deltaVsPrev).toBe(0)
    expect(s.entryCountThisYear).toBe(0)
  })
})

describe('recurringDueState', () => {
  const now = new Date(2026, 6, 13) // 13 Jul 2026 — last monthly-25 occurrence is 25 Jun
  const rule = { id: 'r1', frequency: 'monthly', day_of_month: 25, start_date: '2026-01-25' }

  it('is due when no entry exists since the most recent occurrence', () => {
    expect(recurringDueState(rule, [], now)).toBe('due')
  })

  it('is logged when an entry exists on/after the most recent occurrence', () => {
    const entries = [{ income_recurring_id: 'r1', date: '2026-07-01' }]
    expect(recurringDueState(rule, entries, now)).toBe('logged')
  })

  it('ignores entries for other rules', () => {
    const entries = [{ income_recurring_id: 'other', date: '2026-07-01' }]
    expect(recurringDueState(rule, entries, now)).toBe('due')
  })

  it('ignores an entry logged before the most recent occurrence', () => {
    // Only a May entry — the Jun 25 occurrence is still unlogged.
    const entries = [{ income_recurring_id: 'r1', date: '2026-05-26' }]
    expect(recurringDueState(rule, entries, now)).toBe('due')
  })

  it('is logged (nothing due) when the first payment is still in the future', () => {
    const future = { id: 'r2', frequency: 'monthly', day_of_month: 25, start_date: '2026-09-25' }
    expect(recurringDueState(future, [], now)).toBe('logged')
  })
})
