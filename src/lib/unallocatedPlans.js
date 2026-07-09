import { supabase, getCurrentUserId } from './supabase'
import { resolveRowExact } from './resolveDistribution'

const round2 = n => Number(Number(n).toFixed(2))

// The euro amount a plan would distribute at a given balance, or 0 if it is NOT eligible.
// Eligible when: balance >= threshold AND amount > 0 AND amount <= balance.
export function planAmount(plan, balance) {
  const threshold = Number(plan.threshold)
  let amount
  if      (plan.distribute_mode === 'amount_over_threshold') amount = balance - threshold
  else if (plan.distribute_mode === 'fixed_amount')          amount = Number(plan.distribute_amount)
  else if (plan.distribute_mode === 'full_balance')          amount = balance
  else return 0
  amount = round2(amount)
  if (balance >= threshold && amount > 0 && amount <= balance + 0.005) return amount
  return 0
}

// Resolve a plan's items to euros against its computed amount and fire it via the existing RPC.
// Returns true on success. Shared by check-on-change auto-fire and the conflict Review flow so
// the firing logic lives in exactly one place.
export async function firePlan(unallocatedWalletId, plan, balance) {
  const amount = planAmount(plan, balance)
  if (amount <= 0) return false

  const items = plan.unallocated_plan_items ?? []
  const distributions = []
  let resolvedExact = 0   // unrounded, to judge the split against the amount (ignores per-item rounding)
  for (const it of items) {
    // Same per-item resolution as DistributionPopup, via the shared primitive: percent = that %
    // of the amount, euro = literal euros. We keep the unrounded `exact` for the allocation guard
    // below and round per item for the actual distribution.
    const exact = resolveRowExact(it.mode, it.value, amount)
    if (exact <= 0) continue
    resolvedExact += exact
    const euros = round2(exact)
    if (euros > 0) distributions.push({ wallet_id: it.wallet_id, amount: euros })
  }
  if (distributions.length === 0) return false

  // Defensive guard: a valid plan's split must fully allocate the amount. Skip invalid/legacy
  // splits so they can't mis-distribute.
  if (Math.abs(round2(resolvedExact) - amount) > 0.005) {
    console.warn(`Auto-plan "${plan.name}" skipped: resolved split (${round2(resolvedExact)}) does not match amount (${amount}).`)
    return false
  }

  // HOOK: Stage 4e will log plan firings here.
  const { error } = await supabase.rpc('distribute_from_unallocated', {
    p_unallocated_wallet_id: unallocatedWalletId,
    p_distributions: distributions,
    p_note: 'Auto-plan: ' + plan.name,
  })
  return !error
}

// The current user's single unresolved ('pending') conflict, or null.
export async function fetchPendingConflict() {
  const { data } = await supabase
    .from('unallocated_pending_conflicts')
    .select('*')
    .eq('status', 'pending')
    .maybeSingle()
  return data ?? null
}

// Check-on-change evaluation. Call (additively) after any action that changes the Unallocated
// balance. Auto-fires a single eligible plan; persists a pending conflict when more than one is
// eligible (resolved later by the user via the Review flow). Fires at most one plan per pass and
// never re-evaluates within the same pass (the next balance-changing event triggers the next).
export async function evaluateUnallocatedPlans(unallocatedWalletId) {
  if (!unallocatedWalletId) return

  const { data: w } = await supabase
    .from('wallets').select('balance').eq('id', unallocatedWalletId).single()
  if (!w) return
  const balance = Number(w.balance)

  const { data: plans } = await supabase
    .from('unallocated_plans')
    .select('*, unallocated_plan_items(*)')
    .eq('is_active', true)
  const eligible = (plans ?? []).filter(p => planAmount(p, balance) > 0)

  const pending = await fetchPendingConflict()
  if (pending) {
    // While a conflict is pending we never auto-fire. Keep the snapshot current if there are
    // still multiple eligible plans; if it has narrowed to <=1 leave it for the user to resolve.
    if (eligible.length > 1) {
      await supabase.from('unallocated_pending_conflicts')
        .update({ eligible_plan_ids: eligible.map(p => p.id), balance_snapshot: balance })
        .eq('id', pending.id)
    }
    return
  }

  if (eligible.length === 1) {
    await firePlan(unallocatedWalletId, eligible[0], balance)
  } else if (eligible.length > 1) {
    // Persisted stall: record the conflict for the user to resolve. Do not fire.
    const userId = await getCurrentUserId()
    await supabase.from('unallocated_pending_conflicts').insert({
      user_id: userId,
      balance_snapshot: balance,
      eligible_plan_ids: eligible.map(p => p.id),
      status: 'pending',
    })
  }
  // 0 eligible → nothing.
}
