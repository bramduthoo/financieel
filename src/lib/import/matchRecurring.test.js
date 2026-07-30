import { describe, it, expect } from 'vitest'
import { matchRecurring } from './matchRecurring.js'

// Rules mirror the LIVE shapes (verified against the DB): income_recurring has name/amount/
// frequency/day_of_month/start_date/end_date/parent_rule_id, recurring_rules adds wallet_id and
// description. Neither table stores a counterparty — that lives on the link.
const incomeRule = (over = {}) => ({
  id: 'inc-1',
  name: 'Salary',
  amount: 2714.95,
  frequency: 'monthly',
  day_of_month: 22,
  start_date: '2025-01-22',
  end_date: null,
  parent_rule_id: null,
  ...over,
})

const expenseRule = (over = {}) => ({
  id: 'exp-1',
  name: 'To savings',
  description: null,
  wallet_id: 'wallet-savings',
  amount: 2000,
  frequency: 'monthly',
  day_of_month: 27,
  start_date: '2025-01-27',
  end_date: null,
  parent_rule_id: null,
  ...over,
})

const row = (over = {}) => ({
  date: '2025-12-27',
  amount: 2000,
  direction: 'debit',
  counterparty: 'JANSSENS ELS',
  counterpartyKey: 'janssens els',
  note: 'spaargeld maandloon 1',
  accountIban: 'BE71096123456789',
  ...over,
})

const link = (over = {}) => ({
  id: 'link-1',
  rule_kind: 'expense',
  income_recurring_id: null,
  recurring_rule_id: 'exp-1',
  counterparty_key: 'janssens els',
  direction: 'debit',
  linked_amount: 2000,
  account_iban: null,
  ...over,
})

const verdicts = (rows, ctx) => matchRecurring(rows, ctx).map(r => r.recurring)

describe('first encounter (no saved link)', () => {
  it('asks for confirmation and never auto-excludes', () => {
    const [v] = verdicts([row()], { expenseRules: [expenseRule()] })
    expect(v.state).toBe('needs-confirmation')
    expect(v.reason).toBe('first-encounter')
    expect(v.rule).toMatchObject({ id: 'exp-1', name: 'To savings', amount: 2000, kind: 'expense' })
    expect(v.candidates).toHaveLength(1)
  })

  it('matches a credit against income rules and a debit against expense rules', () => {
    const credit = row({ direction: 'credit', amount: 2714.95, date: '2025-12-22' })
    const income = verdicts([credit], { incomeRules: [incomeRule()], expenseRules: [expenseRule()] })
    expect(income[0].state).toBe('needs-confirmation')
    expect(income[0].kind).toBe('income')

    // The same amount on the wrong side of the ledger must never match.
    const wrongWay = verdicts([row({ amount: 2714.95, date: '2025-12-22' })], {
      incomeRules: [incomeRule()],
    })
    expect(wrongWay[0].state).toBe('normal')
  })

  it('leaves a row alone when no rule shares its amount', () => {
    expect(verdicts([row({ amount: 12.5 })], { expenseRules: [expenseRule()] })[0].state).toBe('normal')
  })

  it('ignores a rule that is not active on the row date', () => {
    const archived = expenseRule({ end_date: '2025-06-30' })
    const future = expenseRule({ id: 'exp-2', start_date: '2026-03-01' })
    expect(verdicts([row()], { expenseRules: [archived, future] })[0].state).toBe('normal')
  })

  it('does not offer a rule that is already linked to another counterparty', () => {
    const other = link({ id: 'link-x', counterparty_key: 'someone else' })
    expect(verdicts([row()], { expenseRules: [expenseRule()], links: [other] })[0].state).toBe('normal')
  })

  it('ranks a name-corroborated rule above one that only matches on amount', () => {
    const rules = [
      expenseRule({ id: 'exp-far', name: 'Insurance', day_of_month: 3, start_date: '2025-01-03' }),
      expenseRule({ id: 'exp-named', name: 'Janssens standing order' }),
    ]
    const [v] = verdicts([row()], { expenseRules: rules })
    expect(v.candidates.map(c => c.id)).toEqual(['exp-named', 'exp-far'])
  })
})

describe('saved link', () => {
  it('recognises a matching row silently', () => {
    const [v] = verdicts([row()], { expenseRules: [expenseRule()], links: [link()] })
    expect(v.state).toBe('recognised')
    expect(v.linkId).toBe('link-1')
    expect(v.rule.id).toBe('exp-1')
  })

  it('resurfaces as a deviation when the amount changed, with the delta', () => {
    const [v] = verdicts([row({ amount: 2050 })], {
      expenseRules: [expenseRule()],
      links: [link()],
    })
    expect(v.state).toBe('deviation')
    expect(v.linkedAmount).toBe(2000)
    expect(v.delta).toBe(50)
    expect(v.rule.id).toBe('exp-1')
  })

  it('follows the rule version chain, so a link on an archived version still resolves', () => {
    // The app never edits an amount in place: it end-dates the old rule and inserts a new
    // version pointing back at it (Income.jsx / RecurringRules.jsx).
    const old = expenseRule({ end_date: '2025-12-01' })
    const current = expenseRule({
      id: 'exp-2',
      amount: 2050,
      parent_rule_id: 'exp-1',
      start_date: '2025-12-01',
    })
    const [v] = verdicts([row({ amount: 2050 })], {
      expenseRules: [old, current],
      links: [link({ linked_amount: 2050 })],
    })
    expect(v.state).toBe('recognised')
    expect(v.rule.id).toBe('exp-2')
    expect(v.rule.amount).toBe(2050)
  })

  it('uses the version that was in force on the row date when backfilling an older month', () => {
    // Re-price in December, then import November: judging the row against the December version
    // would fail its activeness check, drop the link, and import a transfer the recurring flow
    // already posted.
    const old = expenseRule({ end_date: '2025-12-01' })
    const current = expenseRule({
      id: 'exp-2', amount: 2050, parent_rule_id: 'exp-1', start_date: '2025-12-01',
    })
    const [v] = verdicts([row({ date: '2025-11-27' })], {
      expenseRules: [old, current],
      links: [link()],
    })
    expect(v.state).toBe('recognised')
    expect(v.rule.id).toBe('exp-1')
  })

  it('falls back to a fresh match when the linked rule is archived with no successor', () => {
    const [v] = verdicts([row()], {
      expenseRules: [expenseRule({ end_date: '2025-06-30' })],
      links: [link()],
    })
    expect(v.state).toBe('normal')
  })

  it('surfaces a right-amount row that sits nowhere near the schedule', () => {
    const [v] = verdicts([row({ date: '2025-12-09' })], {
      expenseRules: [expenseRule()],
      links: [link()],
    })
    expect(v.state).toBe('needs-confirmation')
    expect(v.reason).toBe('off-schedule')
    expect(v.rule.id).toBe('exp-1')
  })

  it('does not apply a link scoped to a different account', () => {
    // The link belongs to another account, so it cannot cover this row — and its rule is
    // already spoken for, so the row is not re-offered either. It stays importable, which is
    // the direction that can never silently drop money.
    const [v] = verdicts([row()], {
      expenseRules: [expenseRule()],
      links: [link({ account_iban: 'BE00000000000000' })],
    })
    expect(v.state).toBe('normal')
  })
})

describe('per-month budget', () => {
  it('recognises one instance of a monthly rule and leaves a second payment importable', () => {
    const rows = [row({ date: '2025-12-24' }), row({ date: '2025-12-27' })]
    const states = verdicts(rows, { expenseRules: [expenseRule()], links: [link()] }).map(v => v.state)
    // Dropping a real second transfer would be the worst outcome, so only the first is excluded.
    expect(states).toEqual(['recognised', 'normal'])
  })

  it('recognises every instance of a weekly rule in the month', () => {
    const weekly = expenseRule({ frequency: 'weekly', day_of_month: 3, start_date: '2025-11-05' })
    const rows = ['2025-12-03', '2025-12-10', '2025-12-17', '2025-12-24']
      .map(date => row({ date }))
    const states = verdicts(rows, { expenseRules: [weekly], links: [link()] }).map(v => v.state)
    expect(states).toEqual(['recognised', 'recognised', 'recognised', 'recognised'])
  })

  it('counts the budget per calendar month, not per statement', () => {
    const rows = [row({ date: '2025-11-27' }), row({ date: '2025-12-27' })]
    const states = verdicts(rows, { expenseRules: [expenseRule()], links: [link()] }).map(v => v.state)
    expect(states).toEqual(['recognised', 'recognised'])
  })

  it('spends the budget on a deviation too', () => {
    const rows = [row({ date: '2025-12-27', amount: 2050 }), row({ date: '2025-12-28' })]
    const states = verdicts(rows, { expenseRules: [expenseRule()], links: [link()] }).map(v => v.state)
    expect(states).toEqual(['deviation', 'normal'])
  })
})

describe('purity', () => {
  it('returns new rows and mutates nothing it was given', () => {
    const input = [row()]
    const rules = [expenseRule()]
    const links = [link()]
    const snapshot = JSON.stringify({ input, rules, links })

    const out = matchRecurring(input, { expenseRules: rules, links })
    expect(JSON.stringify({ input, rules, links })).toBe(snapshot)
    expect(out[0]).not.toBe(input[0])
    expect(out[0].amount).toBe(input[0].amount)
    expect(out[0].counterpartyKey).toBe(input[0].counterpartyKey)
  })

  it('handles an empty or malformed rule set without throwing', () => {
    expect(verdicts([row()], {})[0].state).toBe('normal')
    expect(matchRecurring(null, {})).toEqual([])
    const broken = expenseRule({ frequency: 'custom', custom_dates: null })
    expect(verdicts([row()], { expenseRules: [broken] })[0].state).toBe('needs-confirmation')
  })
})
