// Pure model behind Phase C — Budgeting "am I budgeting well?" (budgeting-page-plan.md §6, replaced
// by budgeting-phase-C.md). It answers TWO deliberately separate questions from spending/income
// history alone — no snapshots, no schema:
//   - Execution  : did the recurring income actually get logged this month? (computeExecutionStatus)
//   - Estimate   : is wallets.budget the right number, over months?         (computeBudgetPerformance
//                  + detectBudgetDrift)
//
// EVERY time-relative entry point takes an injectable `now` (or pre-derived `windows` from it), so the
// whole module is deterministic under a fixed clock. This is the deferred projection-test seam from
// docs/testing-notes.md, closed here.
//
// Dates are date-only 'yyyy-MM-dd' strings. Month bucketing is done by the 'yyyy-MM' PREFIX, never by
// `new Date(str)`, so there is no UTC-midnight drift between the owner's machine and the UTC CI runner.
// No React, no DB, no formatting.

import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { isMustFund, isFreePool } from './budgetPlan'

const round2 = n => Number(Number(n).toFixed(2))
const EPS = 0.005

// Tunables — one home each, never scattered (§6.8).
export const PERFORMANCE_WINDOW_MONTHS = 6   // overall chart / per-wallet grid span
export const TRAILING_MONTHS           = 3   // every deviation metric + the nudge average over this
export const DRIFT_THRESHOLD_PCT       = 20  // nudge fires past this deviation, same direction

// 'yyyy-MM' bucket key for a 'yyyy-MM-dd' date string (or a Date, via format).
const monthKeyOf = d => (typeof d === 'string' ? d.slice(0, 7) : format(d, 'yyyy-MM'))

// The last `months` calendar months ending with the month containing `now`, oldest → newest.
// `isCurrent` marks the in-progress (partial) month — every deviation metric excludes it.
export function getMonthWindows({ now = new Date(), months = PERFORMANCE_WINDOW_MONTHS } = {}) {
  const base = startOfMonth(now)
  const currentKey = format(base, 'yyyy-MM')
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const d = subMonths(base, i)
    const key = format(d, 'yyyy-MM')
    out.push({
      key,
      label: format(d, 'MMM'),
      start: startOfMonth(d),
      end: endOfMonth(d),
      isCurrent: key === currentKey,
    })
  }
  return out
}

// Per wallet, per window month: { spent, received }. `spent` = confirmed debits (matches the app's
// existing "spending" definition in dashboardCalcs.calculateMonthMetrics); `received` = credits linked
// via income_entry_id to a RECURRING income entry (the realized inflow — already throttled for capped
// wallets). A month with no recurring income entry is `logged:false`; its `received` is absent, which
// the callers must render distinctly from €0 (§6.3.2).
export function computeWalletMonthlyActivity({ transactions = [], incomeEntries = [], windows = [] }) {
  const keys = new Set(windows.map(w => w.key))

  // income_entry ids that belong to a recurring income — the credit → recurring link.
  const recurringEntryIds = new Set(
    incomeEntries.filter(e => e.income_recurring_id != null).map(e => e.id),
  )

  // Which window months actually had a recurring income logged.
  const loggedByMonth = {}
  for (const e of incomeEntries) {
    if (e.income_recurring_id == null) continue
    const k = monthKeyOf(e.date)
    if (keys.has(k)) loggedByMonth[k] = true
  }

  const byWallet = {}
  const cell = (id, k) => {
    const w = (byWallet[id] ??= {})
    return (w[k] ??= { spent: 0, received: 0 })
  }

  for (const t of transactions) {
    const k = monthKeyOf(t.date)
    if (!keys.has(k)) continue
    const amt = Number(t.amount) || 0
    if (amt <= 0) continue
    if (t.type === 'debit' && t.is_confirmed) {
      cell(t.wallet_id, k).spent = round2(cell(t.wallet_id, k).spent + amt)
    } else if (t.type === 'credit' && t.income_entry_id != null && recurringEntryIds.has(t.income_entry_id)) {
      cell(t.wallet_id, k).received = round2(cell(t.wallet_id, k).received + amt)
    }
  }

  const months = windows.map(w => ({
    key: w.key, label: w.label, isCurrent: w.isCurrent, logged: !!loggedByMonth[w.key],
  }))

  return { months, byWallet, loggedByMonth }
}

// Per must-fund wallet WITH a budget (the only honest denominator — §6.4 excludes free-pool and
// budget-less wallets): the trailing-average spend, its deviation from the current budget, and the
// per-month series the chart/grid draw. The trailing average is over the last TRAILING_MONTHS
// COMPLETE months (never the partial current one), so a lumpy accumulating wallet isn't judged on a
// single month.
export function computeBudgetPerformance({ activity, wallets = [], plannedByWallet = {} }) {
  const months = activity?.months ?? []
  const completeKeys = months.filter(m => !m.isCurrent).map(m => m.key)
  const trailingKeys = completeKeys.slice(-TRAILING_MONTHS)

  return wallets
    .filter(isMustFund)
    .filter(w => (Number(w.budget) || 0) > 0)
    .map(w => {
      const budget = Number(w.budget) || 0
      const cells = activity?.byWallet?.[w.id] ?? {}

      const perMonth = months.map(m => ({
        key: m.key, label: m.label, isCurrent: m.isCurrent, logged: m.logged,
        spent: round2(cells[m.key]?.spent ?? 0),
        received: m.logged ? round2(cells[m.key]?.received ?? 0) : null,
      }))

      const spentIn = k => round2(cells[k]?.spent ?? 0)
      const trailingSpents = trailingKeys.map(spentIn)
      const trailingAvgSpent = trailingSpents.length > 0
        ? round2(trailingSpents.reduce((s, v) => s + v, 0) / trailingSpents.length)
        : 0

      const monthsWithData     = completeKeys.filter(k => spentIn(k) > EPS || (cells[k]?.received ?? 0) > EPS).length
      const monthsWithSpending = completeKeys.filter(k => spentIn(k) > EPS).length

      const deviationPct = budget > 0 ? ((trailingAvgSpent - budget) / budget) * 100 : null
      const direction = deviationPct == null || Math.abs(trailingAvgSpent - budget) < EPS
        ? null
        : trailingAvgSpent > budget ? 'over' : 'under'

      return {
        wallet: w, budget, planned: round2(plannedByWallet[w.id] ?? 0),
        trailingAvgSpent, deviationPct, direction,
        monthsWithData, monthsWithSpending,
        trailingKeys, perMonth,
      }
    })
}

// The nudge (§6.5). Fires per wallet ONLY where it is honest to: at least 3 complete months of data
// AND at least 3 months with non-zero spending (this single gate is what stops it nagging about a
// holiday fund behaving exactly as intended), the trailing average deviates past `thresholdPct`, and
// every trailing complete month deviates the SAME direction. Suggests a budget — never writes one.
export function detectBudgetDrift({ performance = [], thresholdPct = DRIFT_THRESHOLD_PCT }) {
  const flagged = []
  for (const p of performance) {
    if (p.monthsWithData < 3 || p.monthsWithSpending < 3) continue
    if (p.deviationPct == null || Math.abs(p.deviationPct) < thresholdPct) continue
    if (!p.direction) continue

    // Consistency: the full trailing window must be present, each month must have ACTUAL spending
    // (>0), and each must land on the same side of the budget. Requiring real spend in every trailing
    // month is what stops a wallet that has simply gone quiet (spent in older months, €0 lately) from
    // being flagged "under budget — money tied up" — the anti-nag intent (§6.5), same as the lumpy gate.
    const trailing = p.perMonth.filter(m => p.trailingKeys.includes(m.key))
    if (trailing.length < TRAILING_MONTHS) continue
    const sameDir = trailing.every(m =>
      m.spent > EPS && (p.direction === 'over' ? m.spent > p.budget + EPS : m.spent < p.budget - EPS))
    if (!sameDir) continue

    flagged.push({
      wallet: p.wallet,
      currentBudget: p.budget,
      trailingAvg: p.trailingAvgSpent,
      suggestedBudget: Math.round(p.trailingAvgSpent),
      direction: p.direction,
      deviationPct: p.deviationPct,
    })
  }
  return flagged
}

// Execution question (§6.6): for the CURRENT calendar month, whether each included recurring income
// has been logged, when, and how the received money split between must-fund wallets and the free pool.
// A not-logged income is a distinct state — never rendered as €0 received.
export function computeExecutionStatus({ incomes = [], incomeEntries = [], transactions = [], wallets = [], now = new Date() }) {
  const currentKey = format(startOfMonth(now), 'yyyy-MM')
  const freePoolIds = new Set(wallets.filter(isFreePool).map(w => w.id))

  const perIncome = incomes.map(inc => {
    const entries = incomeEntries.filter(e => e.income_recurring_id === inc.id && monthKeyOf(e.date) === currentKey)
    const latest = entries.reduce((a, b) => (a && a.date >= b.date ? a : b), null)
    return {
      income: inc,
      logged: entries.length > 0,
      date: latest?.date ?? null,
      entryIds: entries.map(e => e.id),
    }
  })

  const monthEntryIds = new Set(perIncome.flatMap(p => p.entryIds))
  let toWallets = 0
  let toFreePool = 0
  for (const t of transactions) {
    if (t.type !== 'credit' || t.income_entry_id == null || !monthEntryIds.has(t.income_entry_id)) continue
    const amt = Number(t.amount) || 0
    if (amt <= 0) continue
    if (freePoolIds.has(t.wallet_id)) toFreePool = round2(toFreePool + amt)
    else toWallets = round2(toWallets + amt)
  }

  return {
    month: currentKey,
    incomes: perIncome,
    anyLogged: perIncome.some(p => p.logged),
    allLogged: perIncome.length > 0 && perIncome.every(p => p.logged),
    receivedTotal: round2(toWallets + toFreePool),
    toWallets,
    toFreePool,
  }
}
