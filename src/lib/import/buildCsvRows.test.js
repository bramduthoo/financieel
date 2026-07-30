import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCsvRows, toLinkUpserts, toRuleAmountUpdates, unansweredRecurring } from './buildCsvRows.js'
import { toCommitItems, toIncomeRows, shouldInclude } from './buildRows.js'

const CSV = readFileSync(
  new URL('../../../test-fixtures/kbc-csv/monthly-export-01.csv', import.meta.url),
  'utf8',
)

const file = (fileName = 'monthly-export-01.csv', text = CSV) => ({ fileName, text })

const wallets = [
  { id: 'w-groceries', name: 'Groceries', type: 'variable', is_active: true, is_system: false },
  { id: 'w-savings', name: 'Savings', type: 'investment', is_active: true, is_system: false },
  { id: 'w-unallocated', name: 'Unallocated', is_active: true, is_system: true },
]

// The €2000 "spaargeld maandloon 1" self-transfer stands in for a recurring transfer to savings.
const savingsRule = {
  id: 'exp-savings',
  name: 'To savings',
  wallet_id: 'w-savings',
  amount: 2000,
  frequency: 'monthly',
  day_of_month: 27,
  start_date: '2025-01-27',
  end_date: null,
  parent_rule_id: null,
}

const savingsLink = {
  id: 'link-savings',
  rule_kind: 'expense',
  income_recurring_id: null,
  recurring_rule_id: 'exp-savings',
  counterparty_key: 'janssens els',
  direction: 'debit',
  linked_amount: 2000,
  account_iban: null,
}

const savingsRow = rows => rows.find(r => r.note === 'spaargeld maandloon 1')

describe('parsing a batch', () => {
  it('builds one row per transaction with ids, suggestions and defaults', () => {
    const { rows, errors, warnings } = buildCsvRows([file()], { wallets })
    expect(rows).toHaveLength(42)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(new Set(rows.map(r => r.id)).size).toBe(42)
    expect(rows.every(r => r.fileName === 'monthly-export-01.csv')).toBe(true)
    expect(rows.every(r => typeof r.fingerprint === 'string')).toBe(true)
  })

  it('suggests a wallet from a learned mapping and leaves the rest unassigned', () => {
    const { rows } = buildCsvRows([file()], {
      wallets,
      mappings: [{ counterparty_key: 'delhaize watersport', wallet_id: 'w-groceries' }],
    })
    const delhaize = rows.filter(r => r.counterpartyKey === 'delhaize watersport')
    expect(delhaize).toHaveLength(2)
    expect(delhaize.every(r => r.walletId === 'w-groceries')).toBe(true)
    expect(delhaize.every(r => r.suggestion.source === 'learned')).toBe(true)
    expect(rows.find(r => r.counterpartyKey === 'howest').walletId).toBe('')
  })

  it('defaults credits to a refund and debits to no credit mode', () => {
    const { rows } = buildCsvRows([file()], { wallets })
    const credits = rows.filter(r => r.direction === 'credit')
    expect(credits).toHaveLength(5)
    expect(credits.every(r => r.creditMode === 'refund')).toBe(true)
    expect(rows.filter(r => r.direction === 'debit').every(r => r.creditMode === null)).toBe(true)
  })

  it('reports a file it cannot read without losing the others', () => {
    const { rows, errors } = buildCsvRows(
      [file('broken.csv', 'a,b\r\n1,2'), file()],
      { wallets },
    )
    expect(errors).toEqual([{ fileName: 'broken.csv', reason: 'Not a recognised KBC export CSV.' }])
    expect(rows).toHaveLength(42)
  })

  it('reports a KBC export whose row cannot be parsed', () => {
    const damaged = CSV.replace('-50,62;606,22', '-50.62;606,22')
    const { errors } = buildCsvRows([file('damaged.csv', damaged)], { wallets })
    expect(errors[0].fileName).toBe('damaged.csv')
    expect(errors[0].reason).toContain('amount')
  })
})

describe('duplicates', () => {
  it('does not flag two identical rows inside one export as duplicates', () => {
    // A second identical row in the bank's own ledger is a second real transaction. Flagging it
    // would default real spending to skipped.
    const lines = CSV.split('\r')
    const duplicated = [...lines.slice(0, 2), lines[1], ...lines.slice(2)].join('\r')
    const { rows } = buildCsvRows([file('dup.csv', duplicated)], { wallets })
    const delhaize = rows.filter(r => r.date === '2025-12-31' && r.amount === 50.62)
    expect(delhaize).toHaveLength(2)
    expect(delhaize.map(r => r.duplicateOf)).toEqual([null, null])
    expect(delhaize.every(r => r.include)).toBe(true)
  })

  it('flags every row when the same export is added twice in one batch', () => {
    const { rows } = buildCsvRows([file('a.csv'), file('a.csv')], { wallets })
    expect(rows.filter(r => r.duplicateOf === 'batch')).toHaveLength(42)
    expect(rows.filter(r => r.include === false).length).toBe(42)
  })

  it('flags rows already imported in a previous session and pre-skips them', () => {
    const first = buildCsvRows([file()], { wallets }).rows
    const { rows } = buildCsvRows([file()], {
      wallets,
      existingFingerprints: first.map(r => r.fingerprint),
    })
    expect(rows.every(r => r.duplicateOf === 'existing')).toBe(true)
    expect(rows.every(r => r.include === false)).toBe(true)
  })
})

describe('recurring rows', () => {
  it('excludes a recognised row from the preview selection and from the commit', () => {
    const { rows } = buildCsvRows([file()], {
      wallets,
      expenseRules: [savingsRule],
      links: [savingsLink],
    })
    const row = savingsRow(rows)
    expect(row.recurring.state).toBe('recognised')
    expect(row.include).toBe(false)
    expect(toCommitItems(rows).some(i => i.amount === 2000)).toBe(false)
  })

  it('never commits a recurring row even if its include flag is forced on', () => {
    const { rows } = buildCsvRows([file()], {
      wallets,
      expenseRules: [savingsRule],
      links: [savingsLink],
    })
    const forced = rows.map(r =>
      r.note === 'spaargeld maandloon 1' ? { ...r, include: true, walletId: 'w-savings' } : r,
    )
    expect(toCommitItems(forced).some(i => i.amount === 2000)).toBe(false)
  })

  it('never routes a recurring credit into the income flow either', () => {
    const salaryRule = {
      id: 'inc-1', name: 'Salary', amount: 2714.95, frequency: 'monthly',
      day_of_month: 22, start_date: '2025-01-22', end_date: null, parent_rule_id: null,
    }
    const salaryLink = {
      id: 'link-salary', rule_kind: 'income', income_recurring_id: 'inc-1',
      recurring_rule_id: null, counterparty_key: 'universiteit gent',
      direction: 'credit', linked_amount: 2714.95, account_iban: null,
    }
    const { rows } = buildCsvRows([file()], {
      wallets, incomeRules: [salaryRule], links: [salaryLink],
    })
    const salary = rows.find(r => r.amount === 2714.95)
    expect(salary.recurring.state).toBe('recognised')

    const forced = rows.map(r =>
      r.amount === 2714.95 ? { ...r, include: true, creditMode: 'income' } : r,
    )
    expect(toIncomeRows(forced)).toEqual([])
  })

  it('asks on a first encounter and blocks the commit until answered', () => {
    const { rows } = buildCsvRows([file()], { wallets, expenseRules: [savingsRule] })
    const row = savingsRow(rows)
    expect(row.recurring.state).toBe('needs-confirmation')
    expect(row.include).toBe(false)
    expect(unansweredRecurring(rows)).toHaveLength(1)
  })

  it('releases a rejected row back into the import', () => {
    const { rows } = buildCsvRows([file()], { wallets, expenseRules: [savingsRule] })
    const answered = rows.map(r =>
      r.note === 'spaargeld maandloon 1'
        ? { ...r, include: true, walletId: 'w-savings', recurring: { ...r.recurring, answered: true, rejected: true } }
        : r,
    )
    expect(unansweredRecurring(answered)).toEqual([])
    expect(toCommitItems(answered).some(i => i.amount === 2000)).toBe(true)
    expect(toLinkUpserts(answered)).toEqual([])
  })

  it('keeps the duplicate skip when a recurring question is rejected on an imported row', () => {
    // A row can be BOTH already-imported and a recurring candidate. The recurring question
    // blocks the commit, so the user MUST answer it — and answering "no, import it" must not
    // quietly undo the duplicate skip and re-post a transaction that is already in the DB.
    const first = buildCsvRows([file()], { wallets }).rows
    const { rows } = buildCsvRows([file()], {
      wallets,
      expenseRules: [savingsRule],
      existingFingerprints: first.map(r => r.fingerprint),
    })
    const row = savingsRow(rows)
    expect(row.duplicateOf).toBe('existing')
    expect(row.recurring.state).toBe('needs-confirmation')

    const rejected = { ...row, recurring: { ...row.recurring, answered: true, rejected: true } }
    expect(shouldInclude(rejected)).toBe(false)
  })

  it('includes a rejected row that is not a duplicate', () => {
    const { rows } = buildCsvRows([file()], { wallets, expenseRules: [savingsRule] })
    const row = savingsRow(rows)
    const rejected = { ...row, recurring: { ...row.recurring, answered: true, rejected: true } }
    expect(shouldInclude(rejected)).toBe(true)
  })

  it('leaves ordinary rows untouched', () => {
    const { rows } = buildCsvRows([file()], {
      wallets, expenseRules: [savingsRule], links: [savingsLink],
    })
    expect(rows.filter(r => r.recurring.state === 'normal')).toHaveLength(41)
    expect(unansweredRecurring(rows)).toEqual([])
  })
})

describe('link + rule-update payloads', () => {
  const answered = (patch) => {
    const { rows } = buildCsvRows([file()], {
      wallets,
      expenseRules: [savingsRule],
      links: [{ ...savingsLink, linked_amount: 1950 }],   // forces a deviation
    })
    return rows.map(r =>
      r.note === 'spaargeld maandloon 1'
        ? { ...r, recurring: { ...r.recurring, answered: true, confirmedRule: r.recurring.rule, ...patch } }
        : r,
    )
  }

  it('teaches the new amount when the user updates the rule', () => {
    const rows = answered({ updateRuleAmount: true })
    expect(toLinkUpserts(rows)).toEqual([{
      rule: expect.objectContaining({ id: 'exp-savings', kind: 'expense' }),
      counterparty_key: 'janssens els',
      direction: 'debit',
      linked_amount: 2000,
      account_iban: 'BE71096123456789',
      existingLinkId: 'link-savings',
    }])
    expect(toRuleAmountUpdates(rows)).toEqual([{
      rule: expect.objectContaining({ id: 'exp-savings' }),
      amount: 2000,
      date: '2025-12-27',
      counterpartyKey: 'janssens els',
    }])
  })

  it('re-prices a rule ONCE even if several rows deviate against it', () => {
    // Two active successors sharing a parent_rule_id would mean two live recurring rules.
    const deviation = (date, amount) => ({
      amount,
      date,
      counterpartyKey: 'janssens els',
      direction: 'debit',
      recurring: {
        state: 'deviation',
        answered: true,
        updateRuleAmount: true,
        linkedAmount: 1950,
        rule: { kind: 'expense', id: 'exp-savings', name: 'To savings', amount: 1950 },
        confirmedRule: { kind: 'expense', id: 'exp-savings', name: 'To savings', amount: 1950 },
      },
    })
    const updates = toRuleAmountUpdates([
      deviation('2025-11-27', 2000),
      deviation('2025-12-27', 2100),
    ])
    expect(updates).toHaveLength(1)
    expect(updates[0].amount).toBe(2100)   // the newest row's amount is the one in force
  })

  it('keeps the old link amount when the user calls it a one-off', () => {
    const rows = answered({ updateRuleAmount: false })
    expect(toLinkUpserts(rows)[0].linked_amount).toBe(1950)
    expect(toRuleAmountUpdates(rows)).toEqual([])
  })

  it('touches the link of a silently recognised row', () => {
    const { rows } = buildCsvRows([file()], {
      wallets, expenseRules: [savingsRule], links: [savingsLink],
    })
    expect(toLinkUpserts(rows)).toEqual([expect.objectContaining({
      existingLinkId: 'link-savings',
      linked_amount: 2000,
    })])
  })

  it('writes nothing for a batch with no recurring involvement', () => {
    const { rows } = buildCsvRows([file()], { wallets })
    expect(toLinkUpserts(rows)).toEqual([])
    expect(toRuleAmountUpdates(rows)).toEqual([])
  })

  it('sends ONE upsert per link identity even when a rule recognises several rows', () => {
    // A weekly rule legitimately recognises four rows a month, but a link is unique on
    // (user, counterparty, direction): repeating that key inside one upsert is a Postgres error
    // and would lose the link. The €10,40 NMBS rows stand in — same key, four occurrences.
    const nmbsRule = {
      id: 'exp-train', name: 'Train', wallet_id: 'w-savings', amount: 10.4,
      frequency: 'weekly', day_of_month: 1, start_date: '2025-01-06',
      end_date: null, parent_rule_id: null,
    }
    const nmbsLink = {
      id: 'link-train', rule_kind: 'expense', income_recurring_id: null,
      recurring_rule_id: 'exp-train', counterparty_key: 'nmbs sncb web/app brus',
      direction: 'debit', linked_amount: 10.4, account_iban: null,
    }
    const { rows } = buildCsvRows([file()], {
      wallets, expenseRules: [nmbsRule], links: [nmbsLink],
    })
    expect(rows.filter(r => r.recurring.state === 'recognised').length).toBeGreaterThan(1)
    expect(toLinkUpserts(rows)).toHaveLength(1)
  })

  it('prefers an explicit answer over a passive recognition for the same link', () => {
    const { rows } = buildCsvRows([file()], {
      wallets, expenseRules: [savingsRule], links: [savingsLink],
    })
    const withAnswer = rows.map(r =>
      r.note === 'spaargeld maandloon 1'
        ? { ...r, recurring: { ...r.recurring, answered: true, confirmedRule: r.recurring.rule } }
        : r,
    )
    const upserts = toLinkUpserts(withAnswer)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].counterparty_key).toBe('janssens els')
  })

  it('records a boundary once when two exports both prove it', () => {
    const { snapshots } = buildCsvRows([file('dec.csv'), file('dec-copy.csv')], { wallets })
    expect(snapshots).toEqual([
      expect.objectContaining({ boundaryDate: '2025-12-01' }),
      expect.objectContaining({ boundaryDate: '2026-01-01' }),
    ])
  })
})

describe('reconciliation and snapshots', () => {
  it('passes both checks on the real export and derives both boundaries', () => {
    const { checks, snapshots, coverage } = buildCsvRows([file()], { wallets })
    expect(checks.every(c => c.passed)).toBe(true)
    expect(checks.map(c => c.fileName)).toEqual([
      'monthly-export-01.csv', 'monthly-export-01.csv',
    ])
    expect(snapshots).toEqual([
      { accountIban: 'BE71096123456789', boundaryDate: '2025-12-01', balance: 476.63, kind: 'opening' },
      { accountIban: 'BE71096123456789', boundaryDate: '2026-01-01', balance: 606.22, kind: 'closing' },
    ])
    expect(coverage[0]).toMatchObject({ fileName: 'monthly-export-01.csv', months: ['2025-12'] })
  })

  it('counts recurring rows in the balance math, even though they are excluded', () => {
    const withRecurring = buildCsvRows([file()], {
      wallets, expenseRules: [savingsRule], links: [savingsLink],
    })
    const without = buildCsvRows([file()], { wallets })
    const total = r => r.checks.find(c => c.id === 'total')
    // The money moved, so the €2000 must stay in the sum regardless of the import decision.
    expect(total(withRecurring).sum).toBe(total(without).sum)
    expect(total(withRecurring).passed).toBe(true)
  })

  it('reports drift against a stored boundary', () => {
    const { checks } = buildCsvRows([file()], {
      wallets,
      storedSnapshots: [
        { account_iban: 'BE71096123456789', boundary_date: '2025-12-01', balance: '500.00' },
      ],
    })
    const drift = checks.find(c => c.id === 'drift:2025-12-01')
    expect(drift).toMatchObject({ passed: false, expected: 500, actual: 476.63 })
  })

  it('checks each file on its own chain', () => {
    // Merging two files' rows would invent a running balance that never existed, so each
    // export is reconciled separately (the snapshots they prove are then de-duplicated).
    const { checks, snapshots } = buildCsvRows([file('a.csv'), file('b.csv')], { wallets })
    expect(checks.filter(c => c.id === 'chain').map(c => c.fileName)).toEqual(['a.csv', 'b.csv'])
    expect(checks.filter(c => c.id === 'total').map(c => c.fileName)).toEqual(['a.csv', 'b.csv'])
    expect(checks.every(c => c.passed)).toBe(true)
    expect(snapshots).toHaveLength(2)
  })
})
