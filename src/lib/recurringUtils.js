import {
  addDays, addWeeks, addMonths, addQuarters, addYears,
  isBefore, isAfter, startOfDay, format
} from 'date-fns'

export function generatePaymentDates(rule, upToDate) {
  const dates  = []
  const start  = startOfDay(new Date(rule.start_date))
  const cutoff = startOfDay(upToDate)
  const end    = rule.end_date ? startOfDay(new Date(rule.end_date)) : null

  let current = start
  const limit = 500 // safety cap

  while (!isAfter(current, cutoff) && dates.length < limit) {
    if (!end || !isAfter(current, end)) {
      dates.push(new Date(current))
    }
    current = advanceDate(current, rule.frequency)
  }
  return dates
}

export function generateUpcomingDates(rule, fromDate, count = 10) {
  const dates  = []
  const start  = startOfDay(new Date(rule.start_date))
  const from   = startOfDay(fromDate)
  const end    = rule.end_date ? startOfDay(new Date(rule.end_date)) : null

  // fast-forward to first date >= fromDate
  let current = start
  const limit = 5000
  let steps   = 0
  while (isBefore(current, from) && steps < limit) {
    current = advanceDate(current, rule.frequency)
    steps++
  }

  while (dates.length < count) {
    if (end && isAfter(current, end)) break
    dates.push(new Date(current))
    current = advanceDate(current, rule.frequency)
  }
  return dates
}

function advanceDate(date, frequency) {
  switch (frequency) {
    case 'daily':     return addDays(date, 1)
    case 'weekly':    return addWeeks(date, 1)
    case 'monthly':   return addMonths(date, 1)
    case 'quarterly': return addQuarters(date, 1)
    case 'yearly':    return addYears(date, 1)
    default:          return addMonths(date, 1)
  }
}

export function formatFrequency(frequency) {
  const map = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
    quarterly: 'Quarterly', yearly: 'Yearly'
  }
  return map[frequency] ?? frequency
}

export function dayLabel(frequency) {
  switch (frequency) {
    case 'daily':     return null
    case 'weekly':    return 'Day of week'
    case 'monthly':   return 'Day of month'
    case 'quarterly': return 'Day of quarter'
    case 'yearly':    return 'Day of year'
    default:          return 'Day'
  }
}