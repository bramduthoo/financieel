import { describe, it, expect } from 'vitest'
import { isMustFund, isFreePool, buildBudgetPlan, autoFillSingle, buildRuleRows } from './budgetPlan'

// Wallet fixtures (sort_order drives auto-fill priority).
const rent      = { id: 'w-rent',   name: 'Rent',      type: 'fixed',      budget_type: 'fixed-recurring', budget: 1200, sort_order: 0 }
const clothing  = { id: 'w-cloth',  name: 'Clothing',  type: 'variable',   budget_type: 'capped',          budget: 400,  sort_order: 1 }
const groceries = { id: 'w-groc',   name: 'Groceries', type: 'variable',   budget_type: 'accumulating',    budget: 300,  sort_order: 2 }
const invest    = { id: 'w-inv',    name: 'Invest',    type: 'investment', budget_type: 'none',            budget: 0,    sort_order: 3 }
const unalloc   = { id: 'w-unal',   name: 'Unallocated', type: 'unallocated', budget_type: 'unallocated', budget: 0, is_system: true, sort_order: 4 }
const wallets = [rent, clothing, groceries, invest, unalloc]

const salary  = { id: 'inc-sal', name: 'Salary', amount: 2000 }
const sidegig = { id: 'inc-side', name: 'Side gig', amount: 1000 }

describe('budgetPlan — wallet classification', () => {
  it('must-fund = non-system fixed/variable; free-pool = investment/system', () => {
    expect(isMustFund(rent)).toBe(true)
    expect(isMustFund(clothing)).toBe(true)
    expect(isMustFund(groceries)).toBe(true)
    expect(isMustFund(invest)).toBe(false)
    expect(isMustFund(unalloc)).toBe(false)

    expect(isFreePool(invest)).toBe(true)
    expect(isFreePool(unalloc)).toBe(true)
    expect(isFreePool(rent)).toBe(false)
  })
})

describe('budgetPlan — buildBudgetPlan coverage', () => {
  it('single income fully covering every budget → all covered, no shortfall', () => {
    const rulesByIncome = {
      'inc-sal': [
        { wallet_id: 'w-rent',  amount: 1200 },
        { wallet_id: 'w-cloth', amount: 400 },
        { wallet_id: 'w-groc',  amount: 300 },
        { wallet_id: 'w-unal',  amount: 100 },
      ],
    }
    const plan = buildBudgetPlan({ incomes: [salary], rulesByIncome, wallets })
    expect(plan.totalBudget).toBe(1900)
    expect(plan.coveredTotal).toBe(1900)
    expect(plan.totalShort).toBe(0)
    for (const c of plan.coverage) expect(c.status).toBe('covered')
    expect(plan.perIncome[0]).toMatchObject({ amount: 2000, distributed: 2000, unassigned: 0 })
  })

  it('two incomes jointly fund a wallet; another wallet falls short', () => {
    const rulesByIncome = {
      'inc-sal':  [{ wallet_id: 'w-rent', amount: 1200 }, { wallet_id: 'w-cloth', amount: 200 }, { wallet_id: 'w-groc', amount: 100 }],
      'inc-side': [{ wallet_id: 'w-cloth', amount: 200 }],
    }
    const plan = buildBudgetPlan({ incomes: [salary, sidegig], rulesByIncome, wallets })
    const byId = Object.fromEntries(plan.coverage.map(c => [c.wallet.id, c]))
    expect(byId['w-cloth']).toMatchObject({ funded: 400, budget: 400, short: 0, over: 0, status: 'covered' })
    expect(byId['w-rent']).toMatchObject({ funded: 1200, status: 'covered' })
    expect(byId['w-groc']).toMatchObject({ funded: 100, budget: 300, short: 200, status: 'short' })
    expect(plan.totalShort).toBe(200)
    expect(plan.totalIncome).toBe(3000)
  })

  it('over-funding a budget is flagged as over', () => {
    const rulesByIncome = { 'inc-sal': [{ wallet_id: 'w-rent', amount: 1300 }] }
    const plan = buildBudgetPlan({ incomes: [salary], rulesByIncome, wallets })
    const rentCov = plan.coverage.find(c => c.wallet.id === 'w-rent')
    expect(rentCov).toMatchObject({ funded: 1300, budget: 1200, over: 100, short: 0, status: 'over' })
  })
})

describe('budgetPlan — autoFillSingle', () => {
  it('income covers all budgets → each wallet at budget, remainder to Unallocated', () => {
    const { rows, shortfall, totalBudget } = autoFillSingle({ income: salary, wallets, unallocatedWalletId: 'w-unal' })
    expect(shortfall).toBe(0)
    expect(totalBudget).toBe(1900)
    const byId = Object.fromEntries(rows.map(r => [r.wallet_id, r.amount]))
    expect(byId['w-rent']).toBeCloseTo(1200, 2)
    expect(byId['w-cloth']).toBeCloseTo(400, 2)
    expect(byId['w-groc']).toBeCloseTo(300, 2)
    expect(byId['w-unal']).toBeCloseTo(100, 2)   // remainder swept
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(2000, 2)
  })

  it('income below total budgets → priority fill + reported shortfall, no Unallocated remainder', () => {
    const { rows, shortfall } = autoFillSingle({ income: { id: 'inc-x', amount: 1500 }, wallets, unallocatedWalletId: 'w-unal' })
    // rent 1200 (full), clothing 300 of 400 (short 100), groceries 0 (short 300) → shortfall 400.
    expect(shortfall).toBe(400)
    const byId = Object.fromEntries(rows.map(r => [r.wallet_id, r.amount]))
    expect(byId['w-rent']).toBeCloseTo(1200, 2)
    expect(byId['w-cloth']).toBeCloseTo(300, 2)
    expect(byId['w-groc']).toBeUndefined()
    expect(byId['w-unal']).toBeUndefined()       // nothing left to sweep
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1500, 2)
  })
})

describe('budgetPlan — buildRuleRows', () => {
  it('sweeps the leftover to Unallocated and sums to the income', () => {
    const rows = buildRuleRows({
      incomeAmount: 2000,
      allocations: [{ wallet_id: 'w-rent', amount: 1200 }, { wallet_id: 'w-cloth', amount: 400 }, { wallet_id: 'w-groc', amount: 300 }],
      existingRules: [],
      unallocatedWalletId: 'w-unal',
    })
    const unal = rows.find(r => r.wallet_id === 'w-unal')
    expect(unal).toMatchObject({ mode: 'euro', amount: 100 })
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(2000, 2)
  })

  it('preserves an unedited percent rule, but writes euro once its amount changes', () => {
    const existingRules = [{ wallet_id: 'w-cloth', mode: 'percent', value: 10 }] // 10% of 2000 = 200

    const unchanged = buildRuleRows({
      incomeAmount: 2000,
      allocations: [{ wallet_id: 'w-cloth', amount: 200 }],
      existingRules, unallocatedWalletId: 'w-unal',
    })
    const clothUnchanged = unchanged.find(r => r.wallet_id === 'w-cloth')
    expect(clothUnchanged).toMatchObject({ mode: 'percent', value: 10, amount: 200 })

    const changed = buildRuleRows({
      incomeAmount: 2000,
      allocations: [{ wallet_id: 'w-cloth', amount: 250 }],
      existingRules, unallocatedWalletId: 'w-unal',
    })
    const clothChanged = changed.find(r => r.wallet_id === 'w-cloth')
    expect(clothChanged).toMatchObject({ mode: 'euro', value: 250, amount: 250 })
  })
})
