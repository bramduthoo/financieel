import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildRows, toCommitItems, toIncomeRows } from './buildRows.js'
import { fingerprintOf } from './dedupe.js'

function fixture(name) {
  return {
    fileName: `${name}.pdf`,
    text: readFileSync(
      new URL(`../../../test-fixtures/kbc-mobile-export/${name}.txt`, import.meta.url),
      'utf8',
    ),
  }
}

const WALLETS = [
  { id: 'w-groceries', name: 'Groceries', type: 'variable', is_active: true, is_system: false },
  { id: 'w-fun', name: 'Fun money', type: 'variable', is_active: true, is_system: false },
  { id: 'w-unalloc', name: 'Unallocated', type: 'unallocated', is_active: true, is_system: true },
]

const ALL_FOUR = ['card-payment-01', 'card-payment-virtual-01', 'transfer-in-01', 'transfer-out-01']

describe('batch assembly', () => {
  it('merges a multi-file batch into one flat preview table', () => {
    // The defining requirement of this format: users drop many single-transaction PDFs.
    const { rows, errors } = buildRows(ALL_FOUR.map(fixture), { wallets: WALLETS })
    expect(rows).toHaveLength(4)
    expect(errors).toEqual([])
    expect(new Set(rows.map(r => r.id)).size).toBe(4)
  })

  it('gives rows unique ids ACROSS calls, so an appended batch cannot collide', () => {
    // The page appends new files to an existing preview. Colliding ids would make
    // updateRow edit two rows at once — a row meant to be skipped could get committed.
    const first = buildRows([fixture('card-payment-01')], { wallets: WALLETS }).rows
    const second = buildRows([fixture('card-payment-01')], { wallets: WALLETS }).rows
    expect(first[0].id).not.toBe(second[0].id)
  })

  it('records which file each row came from', () => {
    const { rows } = buildRows([fixture('card-payment-01')], { wallets: WALLETS })
    expect(rows[0].fileName).toBe('card-payment-01.pdf')
  })

  it('isolates a bad file instead of failing the whole batch', () => {
    const files = [fixture('card-payment-01'), { fileName: 'broken.pdf', text: 'not a statement' }]
    const { rows, errors } = buildRows(files, { wallets: WALLETS })
    expect(rows).toHaveLength(1)
    expect(errors).toEqual([{ fileName: 'broken.pdf', reason: 'Not a recognised bank statement.' }])
  })

  it('surfaces adapter warnings per file rather than swallowing them', () => {
    const files = [{
      fileName: 'odd.pdf',
      text: [
        'JANSSENS ELS', 'KBC-Rekening', 'BE71 0961 2345 6789 EUR', 'Elektronisch afschrift', '',
        '15-06-2026 MYSTERY PAYEE -5,00 EUR', 'Iets onbekends', '',
        'KBC Bank NV', '2026-A031-BE71 Export KBC Mobile 1/1',
      ].join('\n'),
    }]
    const { rows, warnings } = buildRows(files, { wallets: WALLETS })
    expect(rows).toHaveLength(1)
    expect(warnings[0].fileName).toBe('odd.pdf')
  })
})

describe('row defaults', () => {
  it('includes a fresh row and pre-fills nothing when there is no suggestion', () => {
    const { rows } = buildRows([fixture('card-payment-01')], { wallets: WALLETS })
    expect(rows[0].include).toBe(true)
    expect(rows[0].walletId).toBe('')      // unmatched ⇒ conscious choice required
    expect(rows[0].suggestion).toBeNull()
  })

  it('pre-fills and marks a learned suggestion', () => {
    const mappings = [{ counterparty_key: 'delhaize group', wallet_id: 'w-groceries' }]
    const { rows } = buildRows([fixture('card-payment-01')], { wallets: WALLETS, mappings })
    expect(rows[0].walletId).toBe('w-groceries')
    expect(rows[0].suggestion).toEqual({ walletId: 'w-groceries', source: 'learned' })
  })

  it('defaults a duplicate to skipped but keeps it visible', () => {
    const existing = [fingerprintOf({
      accountIban: 'BE71096123456789', date: '2026-06-15', amount: 18.75,
      direction: 'debit', counterpartyKey: 'delhaize group',
    })]
    const { rows } = buildRows([fixture('card-payment-01')], { wallets: WALLETS, existingFingerprints: existing })
    expect(rows[0].duplicateOf).toBe('existing')
    expect(rows[0].include).toBe(false)
  })

  it('defaults a credit row to a refund credit, not to income', () => {
    const { rows } = buildRows([fixture('transfer-in-01')], { wallets: WALLETS })
    expect(rows[0].direction).toBe('credit')
    expect(rows[0].creditMode).toBe('refund')
  })

  it('leaves debit rows with no credit mode', () => {
    const { rows } = buildRows([fixture('card-payment-01')], { wallets: WALLETS })
    expect(rows[0].creditMode).toBeNull()
  })
})

describe('toCommitItems — what reaches the RPC', () => {
  const rowsOf = () => buildRows(ALL_FOUR.map(fixture), {
    wallets: WALLETS,
    mappings: [
      { counterparty_key: 'delhaize group', wallet_id: 'w-groceries' },
      { counterparty_key: 'spotify', wallet_id: 'w-fun' },
      { counterparty_key: 'vermeulen tom', wallet_id: 'w-fun' },
      { counterparty_key: 'pieter', wallet_id: 'w-fun' },
    ],
  }).rows

  it('sends every included row with a wallet', () => {
    expect(toCommitItems(rowsOf())).toHaveLength(4)
  })

  it('sends positive amounts with the direction carrying the sign', () => {
    const items = toCommitItems(rowsOf())
    expect(items.every(i => i.amount > 0)).toBe(true)
    expect(items.filter(i => i.direction === 'credit')).toHaveLength(1)
    expect(items.filter(i => i.direction === 'debit')).toHaveLength(3)
  })

  it('excludes skipped rows', () => {
    const rows = rowsOf().map(r => ({ ...r, include: false }))
    expect(toCommitItems(rows)).toEqual([])
  })

  it('excludes rows with no wallet chosen', () => {
    const rows = rowsOf().map(r => ({ ...r, walletId: '' }))
    expect(toCommitItems(rows)).toEqual([])
  })

  it('excludes "log as income" rows — they use the existing income path', () => {
    // Two commit mechanisms, deliberately kept separate: the RPC must never see an income
    // row, because distribution is not fused into the import path.
    const rows = rowsOf().map(r => r.direction === 'credit' ? { ...r, creditMode: 'income' } : r)
    const items = toCommitItems(rows)
    expect(items).toHaveLength(3)
    expect(items.every(i => i.direction === 'debit')).toBe(true)
    expect(toIncomeRows(rows)).toHaveLength(1)
  })

  it('carries the fingerprint and counterparty key so the RPC can dedupe and learn', () => {
    const item = toCommitItems(rowsOf())[0]
    expect(item.fingerprint).toContain('|')
    expect(item.counterparty_key).toBeTruthy()
  })
})

describe('toIncomeRows', () => {
  it('returns nothing while credits default to refund', () => {
    const { rows } = buildRows(ALL_FOUR.map(fixture), { wallets: WALLETS })
    expect(toIncomeRows(rows)).toEqual([])
  })

  it('never returns a skipped row', () => {
    const { rows } = buildRows([fixture('transfer-in-01')], { wallets: WALLETS })
    const asIncome = rows.map(r => ({ ...r, creditMode: 'income', include: false }))
    expect(toIncomeRows(asIncome)).toEqual([])
  })
})
