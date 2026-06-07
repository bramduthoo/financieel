import {
  startOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addDays, isBefore, isAfter, format,
} from 'date-fns'
import { generatePaymentDates, generateUpcomingDates } from './recurringUtils'

const isActive = (rule, today) => !rule.end_date || !isBefore(new Date(rule.end_date), today)

function findTransaction(transactions, ruleId, dateStr) {
  return transactions.find(t => t.recurring_rule_id === ruleId && t.date === dateStr)
}

// Unpaid recurring_rules payments due within [today, today+30days], optionally scoped to a wallet
function unpaidUpcomingCosts(recurringRules, transactions, today, cutoff, walletId = null) {
  let total = 0
  for (const rule of recurringRules) {
    if (walletId && rule.wallet_id !== walletId) continue
    if (!isActive(rule, today)) continue
    const dueDates = generatePaymentDates(rule, cutoff).filter(d => !isBefore(d, today))
    for (const date of dueDates) {
      const dateStr = format(date, 'yyyy-MM-dd')
      const existing = findTransaction(transactions, rule.id, dateStr)
      if (!existing || !existing.is_confirmed) {
        total += Number(rule.amount)
      }
    }
  }
  return total
}

export function calculateProjectedCash(wallets, incomeRecurring, recurringRules, transactions) {
  const today  = startOfDay(new Date())
  const cutoff = addDays(today, 30)

  const cashNow = wallets.reduce((s, w) => s + Number(w.balance), 0)

  let expectedIncome = 0
  for (const rule of incomeRecurring) {
    if (!isActive(rule, today)) continue
    const dates = generateUpcomingDates(rule, today, 60).filter(d => !isAfter(d, cutoff))
    expectedIncome += dates.length * Number(rule.amount)
  }

  const upcomingCosts = unpaidUpcomingCosts(recurringRules, transactions, today, cutoff)

  return {
    cashNow,
    expectedIncome,
    upcomingCosts,
    projected: cashNow + expectedIncome - upcomingCosts,
  }
}

export function calculateMonthOutlook(month, incomeRecurring, recurringRules) {
  const monthStart = startOfMonth(month)
  const monthEnd   = endOfMonth(month)

  let income = 0
  for (const rule of incomeRecurring) {
    if (!isActive(rule, monthStart)) continue
    const dates = generatePaymentDates(rule, monthEnd).filter(d => !isBefore(d, monthStart))
    income += dates.length * Number(rule.amount)
  }

  let costs = 0
  for (const rule of recurringRules) {
    if (!isActive(rule, monthStart)) continue
    const dates = generatePaymentDates(rule, monthEnd).filter(d => !isBefore(d, monthStart))
    costs += dates.length * Number(rule.amount)
  }

  return { month, income, costs, projectedNet: income - costs }
}

export function getProjectedBalanceTimeline(wallets, incomeRecurring, recurringRules, transactions, daysAhead = 30) {
  const today  = startOfDay(new Date())
  const cutoff = addDays(today, daysAhead)

  const startBalance = wallets.reduce((s, w) => s + Number(w.balance), 0)

  const events = []

  for (const rule of recurringRules) {
    if (!isActive(rule, today)) continue
    const dueDates = generatePaymentDates(rule, cutoff).filter(d => !isBefore(d, today))
    for (const date of dueDates) {
      const dateStr  = format(date, 'yyyy-MM-dd')
      const existing = findTransaction(transactions, rule.id, dateStr)
      if (!existing || !existing.is_confirmed) {
        events.push({ date, type: 'cost', name: rule.name, amount: Number(rule.amount) })
      }
    }
  }

  for (const rule of incomeRecurring) {
    if (!isActive(rule, today)) continue
    const dates = generateUpcomingDates(rule, today, 60).filter(d => !isAfter(d, cutoff))
    for (const date of dates) {
      events.push({ date, type: 'income', name: rule.name, amount: Number(rule.amount) })
    }
  }

  events.sort((a, b) => a.date - b.date)

  let running = startBalance
  let minBalance = startBalance
  let maxBalance = startBalance
  for (const event of events) {
    running += event.type === 'income' ? event.amount : -event.amount
    event.balanceAfter = running
    minBalance = Math.min(minBalance, running)
    maxBalance = Math.max(maxBalance, running)
  }

  return {
    events,
    startBalance,
    projectedEnd: running,
    minBalance,
    maxBalance,
  }
}

export function getOverduePayments(recurringRules, transactions) {
  const today = startOfDay(new Date())
  const overdue = []

  for (const rule of recurringRules) {
    const dueDates = generatePaymentDates(rule, today).filter(d => isBefore(d, today))
    for (const date of dueDates) {
      const dateStr  = format(date, 'yyyy-MM-dd')
      const existing = findTransaction(transactions, rule.id, dateStr)
      if (!existing || !existing.is_confirmed) {
        overdue.push({ rule, dueDate: date, amount: Number(rule.amount) })
      }
    }
  }

  return overdue.sort((a, b) => a.dueDate - b.dueDate)
}

export function getOverspentWallets(wallets, transactions, currentMonth) {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const result = []

  for (const wallet of wallets.filter(w => w.type === 'variable')) {
    const spent = transactions
      .filter(t => t.wallet_id === wallet.id && t.type === 'debit'
        && !isBefore(new Date(t.date), monthStart) && !isAfter(new Date(t.date), monthEnd))
      .reduce((s, t) => s + Number(t.amount), 0)

    const budget = Number(wallet.budget)
    if (spent > budget) {
      result.push({ wallet, spent, budget, over: spent - budget })
    }
  }

  return result
}

export function getUnderfundedWallets(wallets, recurringRules, transactions, distributionRules, incomeRecurring) {
  const today  = startOfDay(new Date())
  const cutoff = addDays(today, 30)
  const result = []

  for (const wallet of wallets.filter(w => w.type === 'fixed')) {
    const upcomingNeeded = unpaidUpcomingCosts(recurringRules, transactions, today, cutoff, wallet.id)

    let expectedIncome = 0
    for (const dist of distributionRules.filter(d => d.wallet_id === wallet.id)) {
      const incomeRule = incomeRecurring.find(r => r.id === dist.income_recurring_id)
      if (!incomeRule || !isActive(incomeRule, today)) continue
      const dates = generateUpcomingDates(incomeRule, today, 60).filter(d => !isAfter(d, cutoff))
      expectedIncome += dates.length * Number(dist.amount)
    }

    const shortfall = upcomingNeeded - (Number(wallet.balance) + expectedIncome)
    if (shortfall > 0) {
      result.push({ wallet, upcomingNeeded, expectedIncome, shortfall })
    }
  }

  return result
}

function sumInRange(rows, dateField, amountField, start, end, extraFilter = null) {
  return rows
    .filter(r => !isBefore(new Date(r[dateField]), start) && !isAfter(new Date(r[dateField]), end))
    .filter(r => !extraFilter || extraFilter(r))
    .reduce((s, r) => s + Number(r[amountField]), 0)
}

export function calculateMonthMetrics(month, transactions, incomeEntries) {
  const monthStart = startOfMonth(month)
  const monthEnd   = endOfMonth(month)

  const income   = sumInRange(incomeEntries, 'date', 'amount', monthStart, monthEnd)
  const spending = sumInRange(transactions, 'date', 'amount', monthStart, monthEnd,
    t => t.type === 'debit' && t.is_confirmed)
  const net = income - spending

  return {
    income,
    spending,
    net,
    savingsRate: income > 0 ? (net / income) * 100 : null,
  }
}

export function calculateMonthlyAverage(months, transactions, incomeEntries) {
  const metrics = months.map(m => calculateMonthMetrics(m, transactions, incomeEntries))
  const avg = key => metrics.reduce((s, m) => s + m[key], 0) / metrics.length

  const rates = metrics.map(m => m.savingsRate).filter(r => r !== null)

  return {
    income:      avg('income'),
    spending:    avg('spending'),
    net:         avg('net'),
    savingsRate: rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : null,
  }
}

// Total cash currently held minus the net effect (credit - debit) of every confirmed
// transaction dated after `asOf` — reconstructs the balance as it stood at that point in time
function cashAsOf(asOf, transactions, currentTotal) {
  const changeAfter = transactions
    .filter(t => t.is_confirmed && isAfter(new Date(t.date), asOf))
    .reduce((s, t) => s + (t.type === 'credit' ? Number(t.amount) : -Number(t.amount)), 0)
  return currentTotal - changeAfter
}

export function getHistoricalSeries(months, transactions, incomeEntries, wallets) {
  const currentTotal = wallets.reduce((s, w) => s + Number(w.balance), 0)

  return months.map(month => {
    const monthEnd = endOfMonth(month)
    const { income, spending } = calculateMonthMetrics(month, transactions, incomeEntries)

    return {
      month,
      income,
      spending,
      totalCash: cashAsOf(monthEnd, transactions, currentTotal),
    }
  })
}

export function getYearlySeries(years, transactions, incomeEntries, wallets) {
  const currentTotal = wallets.reduce((s, w) => s + Number(w.balance), 0)

  return years.map(year => {
    const yearStart = startOfYear(year)
    const yearEnd   = endOfYear(year)

    const income   = sumInRange(incomeEntries, 'date', 'amount', yearStart, yearEnd)
    const spending = sumInRange(transactions, 'date', 'amount', yearStart, yearEnd,
      t => t.type === 'debit' && t.is_confirmed)

    return {
      year,
      income,
      spending,
      totalCash: cashAsOf(yearEnd, transactions, currentTotal),
    }
  })
}
