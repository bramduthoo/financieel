// Recurring-link matching for the CSV import (kbc-csv-import-background.md §3).
//
// WHY: the app's recurring income and expenses are posted through their own flows — recurring
// income is logged from IncomeRecurringDetail, recurring expenses by ticking them off in
// TransactionChecklist (which inserts the transaction and decrements the wallet). A monthly
// statement contains those same movements, so importing them again double-counts. This decides,
// per row, whether it belongs to a recurring rule.
//
// The model is a PERSISTENT LEARNED LINK, not a monthly re-verification:
//   needs-confirmation  first plausible match → ask once, import nothing yet
//   recognised          a SAVED link matches → silently handled by the rule, excluded
//   deviation           a saved link matches but the amount changed → resurface
//   normal              no recurring involvement → an ordinary importable row
//
// CONSERVATIVE BY DESIGN. A wrong auto-exclude silently drops a real spend, which is worse than
// a missed match, so: nothing is ever auto-excluded without a saved link; a link only covers as
// many rows per month as the rule actually expects; and a row whose date is nowhere near the
// rule's schedule is surfaced instead of swallowed.
//
// Pure. There is deliberately no injected `now`: every decision is relative to the ROW's date
// (activeness, schedule proximity, the per-month quota), never to the wall clock, so the same
// statement always classifies identically.

import { parseISO, differenceInCalendarDays, startOfMonth, endOfMonth, addDays } from 'date-fns'
import { generatePaymentDates } from '../recurringUtils.js'

/** Amounts are compared in cents; anything closer than half a cent is "the same amount". */
const AMOUNT_TOLERANCE = 0.005

/** How far a row may sit from a scheduled date and still count as that instance. */
const DAY_WINDOW = 6

/** Rule-name tokens shorter than this collide far too easily to corroborate anything. */
const MIN_TOKEN = 4

/**
 * @param {Array<object>} rows  normalized transactions (ledger order)
 * @param {{
 *   incomeRules?: Array<object>,   // income_recurring rows — ALL of them, archived included
 *   expenseRules?: Array<object>,  // recurring_rules rows — ALL of them, archived included
 *   links?: Array<object>,         // recurring_import_links rows
 *   amountTolerance?: number,
 *   dayWindow?: number,
 * }} ctx
 * @returns {Array<object>} the same rows, each with a `recurring` verdict attached
 */
export function matchRecurring(rows, ctx = {}) {
  const {
    incomeRules = [],
    expenseRules = [],
    links = [],
    amountTolerance = AMOUNT_TOLERANCE,
    dayWindow = DAY_WINDOW,
  } = ctx

  const rulesByKind = { income: incomeRules, expense: expenseRules }
  // Successors let a link survive the app's rule versioning: changing a rule's amount
  // end-dates it and inserts a new row with parent_rule_id, so a saved link points at an
  // ancestor from then on (Income.jsx / RecurringRules.jsx).
  const successors = {
    income: successorMap(incomeRules),
    expense: successorMap(expenseRules),
  }

  // A rule already linked to some counterparty must not be offered for a different one — it is
  // already accounted for, and offering it invites two links onto one rule.
  const linkedRuleIds = new Set(links.map(l => ruleIdOf(l)).filter(Boolean))

  // Auto-recognition budget per link per calendar month: exactly as many rows as the rule
  // expects that month, so a monthly rule can't swallow a second payment to the same
  // counterparty while a weekly rule still recognises all four of its instances.
  const used = new Map()

  return (rows ?? []).map(row => ({ ...row, recurring: classify(row) }))

  function classify(row) {
    const kind = row.direction === 'credit' ? 'income' : 'expense'
    const link = findLink(row)

    if (link) {
      const rule = resolveRule(link, row.date)
      if (rule && isActive(rule, row.date)) {
        const budgetKey = `${link.id}|${row.date.slice(0, 7)}`
        const spent = used.get(budgetKey) ?? 0
        const budget = expectedThisMonth(rule, row.date)

        if (spent < budget) {
          const sameAmount = Math.abs(Number(link.linked_amount) - row.amount) <= amountTolerance
          const timing = timingVerdict(rule, row.date, dayWindow)

          if (!sameAmount) {
            used.set(budgetKey, spent + 1)
            return {
              state: 'deviation',
              kind: link.rule_kind,
              rule: describe(rule, link.rule_kind),
              linkId: link.id,
              linkedAmount: Number(link.linked_amount),
              delta: round2(row.amount - Number(link.linked_amount)),
              candidates: [describe(rule, link.rule_kind)],
            }
          }

          // Right amount, right counterparty, but nowhere near the schedule: surface it with
          // the rule pre-selected rather than quietly dropping a possibly-real payment.
          if (timing === false) {
            return {
              state: 'needs-confirmation',
              kind: link.rule_kind,
              rule: describe(rule, link.rule_kind),
              linkId: link.id,
              reason: 'off-schedule',
              candidates: [describe(rule, link.rule_kind)],
            }
          }

          used.set(budgetKey, spent + 1)
          return {
            state: 'recognised',
            kind: link.rule_kind,
            rule: describe(rule, link.rule_kind),
            linkId: link.id,
          }
        }

        // The rule's instances for this month are already accounted for, so this is an extra
        // payment to a recurring counterparty — an ordinary importable row.
        return { state: 'normal' }
      }
      // A link pointing at a deleted or archived rule is stale: fall through to a fresh match
      // rather than trusting it.
    }

    const candidates = rankCandidates(row, kind)
    if (candidates.length === 0) return { state: 'normal' }

    return {
      state: 'needs-confirmation',
      kind,
      rule: candidates[0],
      candidates,
      reason: 'first-encounter',
    }
  }

  function findLink(row) {
    return links.find(l =>
      l.counterparty_key === row.counterpartyKey
      && l.direction === row.direction
      && (!l.account_iban || !row.accountIban || l.account_iban === row.accountIban),
    ) ?? null
  }

  // Resolves a link to the version of its rule that was in force ON THE ROW'S DATE, falling
  // back to the newest. Picking "newest" unconditionally breaks backfilling: after a re-pricing,
  // an older month's row would be judged against a successor whose start_date is in the future,
  // fail the activeness check, lose its link, and get imported on top of what the recurring flow
  // already posted.
  function resolveRule(link, isoDate) {
    const kind = link.rule_kind
    const list = rulesByKind[kind] ?? []
    const chain = []
    let rule = list.find(r => r.id === ruleIdOf(link)) ?? null

    const seen = new Set()
    while (rule && !seen.has(rule.id)) {
      seen.add(rule.id)
      chain.push(rule)
      rule = successors[kind].get(rule.id) ?? null
    }
    if (chain.length === 0) return null

    return chain.find(r => isActive(r, isoDate)) ?? chain.at(-1)
  }

  function rankCandidates(row, kind) {
    return (rulesByKind[kind] ?? [])
      .filter(rule => !linkedRuleIds.has(rule.id))
      .filter(rule => isActive(rule, row.date))
      .filter(rule => Math.abs(Number(rule.amount) - row.amount) <= amountTolerance)
      .map(rule => ({ rule, score: score(rule, row, kind) }))
      .sort((a, b) => a.score - b.score)
      .map(scored => describe(scored.rule, kind))
  }

  function score(rule, row, kind) {
    const distance = scheduleDistance(rule, row.date)
    // An unknown schedule must not beat a known near-miss, so it sorts as a mid-range value.
    const timingPart = distance === null ? 50 : distance
    const namePart = nameCorroborates(describe(rule, kind).name, row) ? 0 : 100
    return namePart + timingPart
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function successorMap(rules) {
  const map = new Map()
  for (const rule of rules) {
    if (rule.parent_rule_id) map.set(rule.parent_rule_id, rule)
  }
  return map
}

function ruleIdOf(link) {
  return link.rule_kind === 'income' ? link.income_recurring_id : link.recurring_rule_id
}

/** The display shape the preview needs — the two rule tables name their label differently. */
function describe(rule, kind) {
  return {
    kind,
    id: rule.id,
    name: (kind === 'income' ? rule.name : rule.name || rule.description) || 'Unnamed rule',
    amount: Number(rule.amount),
    walletId: rule.wallet_id ?? null,
  }
}

function isActive(rule, isoDate) {
  if (rule.start_date && isoDate < rule.start_date) return false
  if (rule.end_date && isoDate > rule.end_date) return false
  return true
}

/**
 * Days between the row and the nearest date the rule schedules, or null when the rule's
 * schedule cannot be computed (e.g. a 'custom' frequency with no stored dates — possible on
 * income_recurring, which has no custom_dates column).
 */
function scheduleDistance(rule, isoDate) {
  const target = parseISO(isoDate)
  const dates = safeDates(rule, addDays(target, 400))
  if (dates.length === 0) return null
  return Math.min(...dates.map(d => Math.abs(differenceInCalendarDays(d, target))))
}

function timingVerdict(rule, isoDate, dayWindow) {
  const distance = scheduleDistance(rule, isoDate)
  if (distance === null) return null
  return distance <= dayWindow
}

function expectedThisMonth(rule, isoDate) {
  const monthStart = startOfMonth(parseISO(isoDate))
  const monthEnd = endOfMonth(monthStart)
  const count = safeDates(rule, monthEnd)
    .filter(d => d >= monthStart && d <= monthEnd)
    .length
  // No computable instance this month still allows ONE match; the schedule check above is what
  // decides whether that match is plausible.
  return count > 0 ? count : 1
}

function safeDates(rule, upTo) {
  try {
    return generatePaymentDates(rule, upTo) ?? []
  } catch {
    // A malformed rule must never take the whole import down.
    return []
  }
}

// A whole-word overlap between the rule's name and the row's counterparty/note. Corroboration
// only — never a requirement, because "Rent" rarely resembles a landlord's name.
function nameCorroborates(name, row) {
  const tokens = String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= MIN_TOKEN)
  if (tokens.length === 0) return false

  const words = new Set(
    [row.counterparty, row.counterpartyKey, row.note]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
  return tokens.some(t => words.has(t))
}

function round2(n) {
  return Math.round(n * 100) / 100
}
