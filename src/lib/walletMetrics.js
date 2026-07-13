// Pure wallet metrics for the Wallets page density pass (DESIGN-SPEC §8).
// Display-agnostic: returns raw numbers/dates; the component formats via formatMoney
// + date-fns. Time-relative helpers take an injectable `now` so they stay testable.
//
// NOTE: nothing here writes or computes wallet balances — it only reads what the DB
// already holds (Non-negotiable rule 1).

import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { generateUpcomingDates } from './recurringUtils'

// budget_type values that represent a real monthly budgeted amount (excludes
// investment `none` and the system `unallocated` bucket).
const BUDGETED_TYPES = new Set(['fixed-recurring', 'recurring', 'accumulating', 'capped'])

// Page summary strip (not time-relative): total balance, active wallet count,
// total budgeted per month, and the Unallocated balance.
export function walletsSummary(wallets) {
  let totalBalance = 0
  let activeCount = 0
  let budgetedPerMonth = 0
  let unallocatedBalance = 0

  for (const w of wallets) {
    totalBalance += Number(w.balance) || 0
    if (w.is_active !== false) activeCount += 1
    if (w.type === 'unallocated' || w.is_system) {
      unallocatedBalance += Number(w.balance) || 0
    }
    if (!w.is_system && BUDGETED_TYPES.has(w.budget_type)) {
      budgetedPerMonth += Number(w.budget) || 0
    }
  }

  return { totalBalance, activeCount, budgetedPerMonth, unallocatedBalance }
}

// Net inflow (credits − debits) and transaction count for one wallet within the
// calendar month of `now`. Drives the accumulating "+€X this month" caption and the
// "{n} transactions · {mon}" footer.
export function walletActivityThisMonth(walletId, transactions, now = new Date()) {
  const interval = { start: startOfMonth(now), end: endOfMonth(now) }
  let netInflow = 0
  let count = 0

  for (const t of transactions) {
    if (t.wallet_id !== walletId) continue
    // Transaction dates are stored as plain yyyy-MM-dd calendar strings.
    if (!isWithinInterval(new Date(t.date), interval)) continue
    count += 1
    netInflow += t.type === 'credit' ? Number(t.amount) : -Number(t.amount)
  }

  return { netInflow, count }
}

// The next scheduled recurring EXPENSE payment for a fixed wallet, on/after `now`.
// Returns a Date, or null when the wallet has no upcoming scheduled payment.
export function nextPaymentDue(recurringRules, walletId, now = new Date()) {
  let soonest = null
  for (const rule of recurringRules) {
    if (rule.wallet_id !== walletId) continue
    if (rule.end_date && new Date(rule.end_date) < now) continue
    const [next] = generateUpcomingDates(rule, now, 1)
    if (next && (soonest === null || next < soonest)) soonest = next
  }
  return soonest
}
