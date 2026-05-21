import {
  addDays, addWeeks, addMonths, addQuarters, addYears,
  isBefore, isAfter, startOfDay, format, getMonth, getDate,
  setMonth, setDate, getDay
} from 'date-fns'

export function generatePaymentDates(rule, upToDate) {
  if (rule.frequency === 'custom') {
    return generateCustomDates(rule, upToDate)
  }

  const dates  = []
  const start  = startOfDay(new Date(rule.start_date))
  const cutoff = startOfDay(upToDate)
  const end    = rule.end_date ? startOfDay(new Date(rule.end_date)) : null

  // For frequencies with a specific payment day, find the first actual payment date
  let current = getFirstPaymentDate(rule, start)

  const limit = 1000
  while (!isAfter(current, cutoff) && dates.length < limit) {
    if (!end || !isAfter(current, end)) {
      dates.push(new Date(current))
    }
    current = advanceDate(current, rule)
  }
  return dates
}

export function generateUpcomingDates(rule, fromDate, count = 15) {
  if (rule.frequency === 'custom') {
    return generateCustomUpcoming(rule, fromDate, count)
  }

  const dates  = []
  const start  = startOfDay(new Date(rule.start_date))
  const from   = startOfDay(fromDate)
  const end    = rule.end_date ? startOfDay(new Date(rule.end_date)) : null

  let current = getFirstPaymentDate(rule, start)
  const limit = 5000
  let steps   = 0

  while (isBefore(current, from) && steps < limit) {
    current = advanceDate(current, rule)
    steps++
  }

  while (dates.length < count) {
    if (end && isAfter(current, end)) break
    dates.push(new Date(current))
    current = advanceDate(current, rule)
  }
  return dates
}

// Given a rule and its start date, find the first date the payment actually falls on
function getFirstPaymentDate(rule, start) {
  switch (rule.frequency) {
    case 'daily':
      return start

    case 'weekly': {
      // day_of_month stores 1=Mon ... 7=Sun
      const target = (rule.day_of_month ?? 1)
      let d = new Date(start)
      // getDay() returns 0=Sun,1=Mon... convert to 1=Mon..7=Sun
      const toMon = (n) => n === 0 ? 7 : n
      while (toMon(getDay(d)) !== target) {
        d = addDays(d, 1)
      }
      return d
    }

    case 'monthly': {
      const day = rule.day_of_month ?? 1
      let d = new Date(start.getFullYear(), start.getMonth(), day)
      if (isBefore(d, start)) d = addMonths(d, 1)
      return d
    }

    case 'quarterly': {
      // day_of_month = day, quarter_month = which month in quarter (1,2,3)
      const qMonth = (rule.quarter_month ?? 1) - 1 // 0-indexed offset
      const day    = rule.day_of_month ?? 1
      // Find the first quarter start >= start date
      const startMonth = start.getMonth()
      const qStart = Math.floor(startMonth / 3) * 3 // 0, 3, 6, 9
      let d = new Date(start.getFullYear(), qStart + qMonth, day)
      if (isBefore(d, start)) d = addQuarters(d, 1)
      return d
    }

    case 'yearly': {
      // day_of_month = day, yearly_month = month (0-indexed)
      const month = rule.yearly_month ?? 0
      const day   = rule.day_of_month ?? 1
      let d = new Date(start.getFullYear(), month, day)
      if (isBefore(d, start)) d = addYears(d, 1)
      return d
    }

    default:
      return start
  }
}

function advanceDate(date, rule) {
  switch (rule.frequency) {
    case 'daily':     return addDays(date, 1)
    case 'weekly':    return addWeeks(date, 1)
    case 'monthly':   return addMonths(date, 1)
    case 'quarterly': return addQuarters(date, 1)
    case 'yearly':    return addYears(date, 1)
    default:          return addMonths(date, 1)
  }
}

// Custom frequency: dates are stored as array of 'MM-DD' strings, repeating every N years
function generateCustomDates(rule, upToDate) {
  if (!rule.custom_dates?.length) return []
  const cutoff    = startOfDay(upToDate)
  const startYear = new Date(rule.start_date).getFullYear()
  const cycleYears = rule.custom_cycle_years ?? 1
  const dates     = []
  const limit     = 500

  let cycleStart = startYear
  while (dates.length < limit) {
    for (const mmdd of rule.custom_dates) {
      const [mm, dd] = mmdd.split('-').map(Number)
      const d = startOfDay(new Date(cycleStart, mm - 1, dd))
      if (isAfter(d, cutoff)) return dates
      if (!isBefore(d, startOfDay(new Date(rule.start_date)))) {
        dates.push(d)
      }
    }
    cycleStart += cycleYears
    if (cycleStart > cutoff.getFullYear() + cycleYears + 1) break
  }
  return dates
}

function generateCustomUpcoming(rule, fromDate, count) {
  if (!rule.custom_dates?.length) return []
  const from       = startOfDay(fromDate)
  const startYear  = new Date(rule.start_date).getFullYear()
  const cycleYears = rule.custom_cycle_years ?? 1
  const dates      = []

  let cycleStart = startYear
  const maxYear  = from.getFullYear() + 10
  while (cycleStart <= maxYear && dates.length < count) {
    for (const mmdd of rule.custom_dates) {
      const [mm, dd] = mmdd.split('-').map(Number)
      const d = startOfDay(new Date(cycleStart, mm - 1, dd))
      if (!isBefore(d, from)) {
        dates.push(d)
        if (dates.length >= count) break
      }
    }
    cycleStart += cycleYears
  }
  return dates
}

export function formatFrequency(frequency) {
  const map = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
    quarterly: 'Quarterly', yearly: 'Yearly', custom: 'Custom'
  }
  return map[frequency] ?? frequency
}