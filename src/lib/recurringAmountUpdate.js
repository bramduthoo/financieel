// Changing a recurring rule's amount — the ONE definition of that write.
//
// The app never updates an amount in place. It archives the current rule (end_date = today) and
// inserts a NEW version pointing back at it via parent_rule_id, so past entries keep the amount
// they were actually posted with. Both rule tables work this way (Income.jsx for
// income_recurring, RecurringRules.jsx for recurring_rules), and the CSV import's
// deviation flow ("the statement says €2050, update the rule") must do exactly the same thing
// rather than a convenient `update({ amount })`.
//
// An INCOME rule additionally requires its distribution to be redone: income_distribution_rules
// are keyed by income_recurring_id, so a new version starts with none, and a recurring income
// with no distribution cannot be logged. Callers must therefore run the mandatory
// DistributionPopup step and persist the result with `saveRecurringDistribution` below —
// `needsDistribution` in the result says when.
//
// Scope note: `updateRecurringAmount` is the AMOUNT-ONLY re-price, which is what the import's
// deviation flow needs — it copies the existing rule forward. The Income page's editor is a
// different operation (it re-versions while also applying an edited name/frequency/day from its
// form), so it keeps its own write; only `saveRecurringDistribution` is shared with it.
//
// No balance math anywhere here: rules are configuration. Money still moves only through the
// existing RPCs.

import { format } from 'date-fns'
import { supabase, getCurrentUserId } from './supabase'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

/**
 * Archive `rule` and insert its successor carrying `amount`.
 *
 * @param {{ kind: 'income'|'expense', id: string }} rule  the rule as matched
 * @param {number} amount  the new amount
 * @returns {Promise<{ newRule: object, needsDistribution: boolean }>}
 * @throws on any failed write, having left the previous version untouched where possible
 */
export async function updateRecurringAmount(rule, amount) {
  const table = rule.kind === 'income' ? 'income_recurring' : 'recurring_rules'
  const userId = await getCurrentUserId()

  const { data: current, error: readError } = await supabase
    .from(table).select('*').eq('id', rule.id).single()
  if (readError) throw readError
  if (!current) throw new Error('That recurring rule no longer exists.')

  // Copy the rule forward wholesale, minus the identity/versioning columns, so a schedule
  // field this code does not know about (quarter_month, custom_dates, include_in_budget …)
  // survives the version bump instead of silently resetting to its default.
  const carried = { ...current }
  for (const column of ['id', 'created_at', 'parent_rule_id', 'end_date']) delete carried[column]

  const { error: archiveError } = await supabase
    .from(table).update({ end_date: todayStr() }).eq('id', rule.id)
  if (archiveError) throw archiveError

  const { data: newRule, error: insertError } = await supabase
    .from(table)
    .insert({
      ...carried,
      amount,
      start_date: todayStr(),
      parent_rule_id: rule.id,
      user_id: current.user_id ?? userId,
    })
    .select()
    .single()

  if (insertError) {
    // Put the archived version back: leaving it end-dated with no successor would silently
    // stop a recurring rule the user only meant to re-price. If even THAT fails, the rule is
    // now stopped, which the caller must be able to say out loud.
    const { error: restoreError } = await supabase
      .from(table).update({ end_date: current.end_date }).eq('id', rule.id)
    if (restoreError) {
      throw new Error(
        `${insertError.message} — and the previous version could not be restored, so this rule is `
        + `now archived and will not run. Re-create it from its own page (${restoreError.message}).`,
      )
    }
    throw insertError
  }

  return { newRule, needsDistribution: rule.kind === 'income' }
}

/**
 * Persist a recurring income's distribution — the same rows the Income page writes after the
 * mandatory setup popup, keeping the user's %/€ intent (mode + value) with `amount` in sync
 * with the resolved euro value.
 *
 * @param {string} incomeRecurringId
 * @param {Array<{wallet_id: string, mode: string, value: number, amount: number}>} ruleRows
 *        DistributionPopup's `meta.allRows` — explicit rows PLUS the remainder sweep
 */
export async function saveRecurringDistribution(incomeRecurringId, ruleRows) {
  if (!incomeRecurringId || !(ruleRows?.length > 0)) return

  const userId = await getCurrentUserId()
  const { error } = await supabase.from('income_distribution_rules').insert(
    ruleRows.map((r, i) => ({
      income_recurring_id: incomeRecurringId,
      wallet_id: r.wallet_id,
      mode: r.mode,
      value: r.value,
      amount: r.amount,
      priority: i,
      user_id: userId,
    })),
  )
  if (error) throw error
}
