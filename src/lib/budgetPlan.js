// Pure model behind the Budgeting page (budgeting-page-plan.md §5). It reads recurring incomes,
// their distribution rules, and wallets, and produces:
//   - buildBudgetPlan   → the read model: per-wallet budget coverage across ALL included incomes,
//                          per-income distribution totals, and plan-level totals (for display).
//   - autoFillSingle    → the single-income auto-distribution: fill each must-fund wallet to its
//                          budget in priority order, remainder → Unallocated, report any shortfall.
//   - buildRuleRows     → turn one income's per-wallet allocation into the ordered rule rows for the
//                          delete-all-for-income + reinsert write (preserving unedited percent rules).
//
// Money math is delegated to the tested resolver in resolveDistribution.js — this file never invents
// euro/percent arithmetic. No React, no DB, no formatting.

import { resolveDistribution } from './resolveDistribution'

const round2 = n => Number(Number(n).toFixed(2))

// Wallet roles. Must-fund wallets have a budget the plan aims to cover (fixed + variable, i.e.
// accumulating/capped). Free-pool wallets absorb whatever is left (investment + the system
// Unallocated wallet); Unallocated is the default residual target.
export function isMustFund(w) {
  return !w.is_system && (w.type === 'fixed' || w.type === 'variable')
}
export function isFreePool(w) {
  return !!w.is_system || w.type === 'investment'
}

// Read model for the whole plan. `incomes` = the included recurring incomes; `rulesByIncome` maps
// income id → its distribution rules ([{wallet_id, amount, mode, value}]); `wallets` = active wallets.
export function buildBudgetPlan({ incomes = [], rulesByIncome = {}, wallets = [] }) {
  const mustFundWallets = wallets.filter(isMustFund)

  // Euros routed to each wallet, summed across every included income (the plan-level view).
  const fundedByWallet = {}
  for (const inc of incomes) {
    for (const r of (rulesByIncome[inc.id] ?? [])) {
      fundedByWallet[r.wallet_id] = round2((fundedByWallet[r.wallet_id] ?? 0) + Number(r.amount))
    }
  }

  const coverage = mustFundWallets
    // Skip wallets that are pure noise (no budget target and nothing funded); keep an unbudgeted
    // wallet that is nonetheless receiving money so it can surface as "over".
    .filter(w => (Number(w.budget) || 0) > 0 || (fundedByWallet[w.id] ?? 0) > 0)
    .map(w => {
      const funded = round2(fundedByWallet[w.id] ?? 0)
      const budget = Number(w.budget) || 0
      const short  = round2(Math.max(0, budget - funded))
      const over   = round2(Math.max(0, funded - budget))
      return {
        wallet: w, funded, budget, short, over,
        status: short > 0.005 ? 'short' : over > 0.005 ? 'over' : 'covered',
      }
    })

  const perIncome = incomes.map(inc => {
    const rules       = rulesByIncome[inc.id] ?? []
    const amount      = Number(inc.amount) || 0
    const distributed = round2(rules.reduce((s, r) => s + Number(r.amount), 0))
    return { income: inc, amount, distributed, unassigned: round2(amount - distributed) }
  })

  const totalIncome  = round2(incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0))
  const totalBudget  = round2(mustFundWallets.reduce((s, w) => s + (Number(w.budget) || 0), 0))
  const coveredTotal = round2(coverage.reduce((s, c) => s + Math.min(c.funded, c.budget), 0))
  const totalShort   = round2(coverage.reduce((s, c) => s + c.short, 0))

  return { coverage, perIncome, totalIncome, totalBudget, coveredTotal, totalShort }
}

// Single-income auto-distribution: fund each must-fund wallet (budget > 0) up to its budget in
// sort_order priority; whatever the income can't cover becomes `shortfall`; the remainder (income −
// funded) sweeps to Unallocated via buildRuleRows. Returns the rule rows plus the shortfall.
export function autoFillSingle({ income, wallets = [], unallocatedWalletId = null }) {
  const amount = Number(income?.amount) || 0
  const mustFund = wallets
    .filter(isMustFund)
    .filter(w => (Number(w.budget) || 0) > 0)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  let remaining = amount
  let shortfall = 0
  const allocations = []
  for (const w of mustFund) {
    const budget = Number(w.budget) || 0
    const give   = round2(Math.min(budget, Math.max(0, remaining)))
    if (give < budget - 0.005) shortfall = round2(shortfall + (budget - give))
    if (give > 0) allocations.push({ wallet_id: w.id, amount: give })
    remaining = round2(remaining - give)
  }

  const totalBudget = round2(mustFund.reduce((s, w) => s + (Number(w.budget) || 0), 0))
  const rows = buildRuleRows({ incomeAmount: amount, allocations, existingRules: [], unallocatedWalletId })
  return { rows, shortfall, totalBudget }
}

// Turn one income's explicit per-wallet allocation into the ordered rule rows for its
// delete+reinsert. `allocations` = ordered [{wallet_id, amount}] for must-fund + investment wallets
// (NOT Unallocated — the leftover sweeps there automatically). Percent preservation: if a wallet's
// existing rule is percent and its euro value is unchanged, the row stays percent; otherwise euro.
// Returns [{wallet_id, mode, value, amount}] summing to incomeAmount (remainder → Unallocated).
export function buildRuleRows({ incomeAmount, allocations = [], existingRules = [], unallocatedWalletId = null }) {
  const total = Number(incomeAmount) || 0
  const existingByWallet = {}
  for (const r of existingRules) existingByWallet[r.wallet_id] = r

  const rows = allocations
    .filter(a => Number(a.amount) > 0)
    .map(a => {
      const ex = existingByWallet[a.wallet_id]
      if (ex && ex.mode === 'percent') {
        const euro = round2((Number(ex.value) / 100) * total)
        if (Math.abs(euro - round2(a.amount)) < 0.005) {
          return { wallet_id: a.wallet_id, mode: 'percent', value: round2(Number(ex.value)) }
        }
      }
      return { wallet_id: a.wallet_id, mode: 'euro', value: round2(a.amount) }
    })

  const resolved = resolveDistribution(rows, total, { sendRemainder: true, unallocatedWalletId })
  return resolved.allRows
}
