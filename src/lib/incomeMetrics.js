// Pure income metrics for the Income page density pass (DESIGN-SPEC §8).
// Display-agnostic (raw numbers/strings out) and time-relative helpers take an
// injectable `now` so behaviour tests stay deterministic.

import {
  startOfMonth, endOfMonth, subMonths, format, isWithinInterval, getYear,
} from 'date-fns'
import { generatePaymentDates } from './recurringUtils'

function sumInMonth(entries, month) {
  const interval = { start: startOfMonth(month), end: endOfMonth(month) }
  return entries.reduce(
    (s, e) => (isWithinInterval(new Date(e.date), interval) ? s + Number(e.amount) : s),
    0,
  )
}

// Summary strip numbers for the Income page: this-month total, previous-month total,
// the delta between them (with the previous month's name for the label), and how many
// entries fall in `now`'s calendar year.
export function incomeSummary(entries, now = new Date()) {
  const prev = subMonths(now, 1)
  const thisMonthTotal = sumInMonth(entries, now)
  const prevMonthTotal = sumInMonth(entries, prev)
  const year = getYear(now)
  const entryCountThisYear = entries.filter(e => getYear(new Date(e.date)) === year).length

  return {
    thisMonthTotal,
    prevMonthTotal,
    deltaVsPrev: thisMonthTotal - prevMonthTotal,
    prevMonthLabel: format(prev, 'MMMM'),
    entryCountThisYear,
    year,
  }
}

// Whether a recurring income rule is currently DUE to be logged. A rule is 'due' when
// its most recent scheduled occurrence on/before `now` has no logged income entry on or
// after that date; otherwise 'logged'. Rules whose first occurrence is still in the
// future are 'logged' (nothing is due yet). Surfaces the existing manual-log flow — this
// computes state only, it never logs anything.
export function recurringDueState(rule, entries, now = new Date()) {
  const occurrences = generatePaymentDates(rule, now)
  const last = occurrences[occurrences.length - 1]
  if (!last) return 'logged' // first payment hasn't come round yet

  const lastStr = format(last, 'yyyy-MM-dd')
  const logged = entries.some(
    e => e.income_recurring_id === rule.id && e.date >= lastStr,
  )
  return logged ? 'logged' : 'due'
}
