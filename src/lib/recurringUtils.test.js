import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import {
  generatePaymentDates, generateUpcomingDates, formatFrequency,
} from './recurringUtils'

// Assert on formatted yyyy-MM-dd strings so the comparison is stable regardless of the runner's
// timezone (the app stores plain calendar dates).
const ymd = dates => dates.map(d => format(d, 'yyyy-MM-dd'))

describe('generatePaymentDates', () => {
  it('monthly: emits the payment day of each month up to the cutoff', () => {
    const rule = { frequency: 'monthly', day_of_month: 10, start_date: '2026-01-10' }
    expect(ymd(generatePaymentDates(rule, new Date(2026, 3, 15)))).toEqual([
      '2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10',
    ])
  })

  it('monthly: skips to the next month when the start date is after the payment day', () => {
    // start Jan 20 but payment day is the 10th → first payment is Feb 10.
    const rule = { frequency: 'monthly', day_of_month: 10, start_date: '2026-01-20' }
    expect(ymd(generatePaymentDates(rule, new Date(2026, 2, 15)))).toEqual([
      '2026-02-10', '2026-03-10',
    ])
  })

  it('monthly: stops at end_date', () => {
    const rule = { frequency: 'monthly', day_of_month: 10, start_date: '2026-01-10', end_date: '2026-02-28' }
    expect(ymd(generatePaymentDates(rule, new Date(2026, 5, 1)))).toEqual([
      '2026-01-10', '2026-02-10',
    ])
  })

  it('returns an empty list when the cutoff is before the first payment', () => {
    const rule = { frequency: 'monthly', day_of_month: 10, start_date: '2026-06-10' }
    expect(generatePaymentDates(rule, new Date(2026, 0, 1))).toEqual([])
  })
})

describe('generateUpcomingDates', () => {
  it('weekly: emits the configured weekday (Wed) for the requested count', () => {
    // day_of_month stores 1=Mon..7=Sun; 3 = Wednesday. Jan 1 2026 is a Thursday, so the first
    // Wednesday on/after the start is Jan 7.
    const rule = { frequency: 'weekly', day_of_month: 3, start_date: '2026-01-01' }
    expect(ymd(generateUpcomingDates(rule, new Date(2026, 0, 1), 3))).toEqual([
      '2026-01-07', '2026-01-14', '2026-01-21',
    ])
  })

  it('daily: emits consecutive days', () => {
    const rule = { frequency: 'daily', start_date: '2026-03-01' }
    expect(ymd(generateUpcomingDates(rule, new Date(2026, 2, 1), 3))).toEqual([
      '2026-03-01', '2026-03-02', '2026-03-03',
    ])
  })

  it('yearly: repeats the same month/day each year', () => {
    // yearly_month is 0-indexed → 1 = February.
    const rule = { frequency: 'yearly', yearly_month: 1, day_of_month: 15, start_date: '2026-02-15' }
    expect(ymd(generateUpcomingDates(rule, new Date(2026, 0, 1), 2))).toEqual([
      '2026-02-15', '2027-02-15',
    ])
  })

  it('honours end_date by emitting fewer than the requested count', () => {
    const rule = { frequency: 'monthly', day_of_month: 1, start_date: '2026-01-01', end_date: '2026-02-15' }
    expect(ymd(generateUpcomingDates(rule, new Date(2026, 0, 1), 12))).toEqual([
      '2026-01-01', '2026-02-01',
    ])
  })
})

describe('formatFrequency', () => {
  it('maps known frequencies to display labels', () => {
    expect(formatFrequency('monthly')).toBe('Monthly')
    expect(formatFrequency('quarterly')).toBe('Quarterly')
  })

  it('falls back to the raw value for an unknown frequency', () => {
    expect(formatFrequency('fortnightly')).toBe('fortnightly')
  })
})
