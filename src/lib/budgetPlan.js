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

// Per-wallet funding from a flat list of euro allocations — the single source of truth shared by the
// saved-plan view (via buildBudgetPlan) and the live distribution editor, which computes the same
// numbers from unsaved edit state. `allocations` = [{ wallet_id, amount }] from ANY number of
// incomes; this function is deliberately income-agnostic.
//
// Returns `fundedByWallet` (every wallet that received something, tiles need free-pool wallets too)
// and `coverage` (must-fund wallets only — the ones with an honest budget denominator).
export function computeWalletFunding({ wallets = [], allocations = [] }) {
  const fundedByWallet = {}
  for (const a of allocations) {
    const amt = Number(a.amount) || 0
    if (amt <= 0) continue
    fundedByWallet[a.wallet_id] = round2((fundedByWallet[a.wallet_id] ?? 0) + amt)
  }

  const coverage = wallets
    .filter(isMustFund)
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
        pct: budget > 0 ? (funded / budget) * 100 : null,
        status: short > 0.005 ? 'short' : over > 0.005 ? 'over' : 'covered',
      }
    })

  return { fundedByWallet, coverage }
}

// Euros this income should add to `wallet` when the user ticks "fund to budget" on that row
// (budgeting-page-plan.md §12.8-5). It fills the wallet's REMAINING shortfall — its budget minus
// what every OTHER included income already sends it — so a wallet already fed by another income is
// never double-funded. Clamped to this income's unassigned remainder, so an income can never be
// over-allocated. `allocations` = [{ income_id, wallet_id, amount }] across all included incomes.
export function fundToBudget({ wallet, incomeId, incomeAmount = 0, allocations = [] }) {
  const budget = Number(wallet?.budget) || 0
  if (budget <= 0) return 0

  let fundedByOthers = 0
  let assignedElsewhereByThisIncome = 0
  for (const a of allocations) {
    const amt = Number(a.amount) || 0
    if (amt <= 0) continue
    if (a.wallet_id === wallet.id && a.income_id !== incomeId) fundedByOthers += amt
    if (a.income_id === incomeId && a.wallet_id !== wallet.id) assignedElsewhereByThisIncome += amt
  }

  const shortfall = Math.max(0, budget - fundedByOthers)
  const remainder = Math.max(0, (Number(incomeAmount) || 0) - assignedElsewhereByThisIncome)
  return round2(Math.min(shortfall, remainder))
}

// Resolve ONE income's editor state into rule rows, via the shared resolver. Used by both the
// editor (to drive its live bars and footers) and the save path (to produce the bytes written) —
// deliberately one function, so what the user sees and what gets persisted can never diverge.
// `edits` is { [walletId]: { mode, value } } for this income; euros are the resolver's output only.
export function resolveIncomeEdit({ income, editableWallets = [], edits = {}, unallocatedWalletId = null }) {
  const rows = editableWallets
    .map(w => ({ wallet_id: w.id, ...(edits[w.id] ?? { mode: 'euro', value: '' }) }))
    .filter(r => Number(r.value) > 0)
  return resolveDistribution(rows, Number(income?.amount) || 0, {
    sendRemainder: true, unallocatedWalletId,
  })
}

// Read model for the whole plan. `incomes` = the included recurring incomes; `rulesByIncome` maps
// income id → its distribution rules ([{wallet_id, amount, mode, value}]); `wallets` = active wallets.
export function buildBudgetPlan({ incomes = [], rulesByIncome = {}, wallets = [] }) {
  const mustFundWallets = wallets.filter(isMustFund)

  // Euros routed to each wallet, summed across every included income (the plan-level view).
  const allocations = incomes.flatMap(inc => (rulesByIncome[inc.id] ?? []).map(r => ({
    income_id: inc.id, wallet_id: r.wallet_id, amount: Number(r.amount),
  })))
  const { fundedByWallet, coverage } = computeWalletFunding({ wallets, allocations })

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

  return { coverage, fundedByWallet, perIncome, totalIncome, totalBudget, coveredTotal, totalShort }
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
