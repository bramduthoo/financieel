import { describe, it, expect } from 'vitest'
import { fingerprintOf, flagDuplicates } from './dedupe.js'

const tx = (over = {}) => ({
  accountIban: 'BE71096123456789',
  date: '2026-06-15',
  amount: 18.75,
  direction: 'debit',
  counterpartyKey: 'delhaize group',
  ...over,
})

describe('fingerprintOf', () => {
  it('is stable for the same transaction', () => {
    expect(fingerprintOf(tx())).toBe(fingerprintOf(tx()))
  })

  it('normalises the amount so 18.75 and 18.750 agree', () => {
    expect(fingerprintOf(tx({ amount: 18.75 }))).toBe(fingerprintOf(tx({ amount: 18.7500001 })))
  })

  it('separates transactions that differ in any component', () => {
    const base = fingerprintOf(tx())
    expect(fingerprintOf(tx({ date: '2026-06-16' }))).not.toBe(base)
    expect(fingerprintOf(tx({ amount: 18.76 }))).not.toBe(base)
    expect(fingerprintOf(tx({ counterpartyKey: 'colruyt' }))).not.toBe(base)
    expect(fingerprintOf(tx({ accountIban: 'BE68539007547034' }))).not.toBe(base)
  })

  it('separates a refund from the purchase it reverses', () => {
    // Same account, day, amount and merchant — only the direction differs. Without
    // direction in the key, a refund would be silently skipped as a duplicate.
    expect(fingerprintOf(tx({ direction: 'credit' }))).not.toBe(fingerprintOf(tx()))
  })
})

describe('flagDuplicates', () => {
  it('flags a row already imported in a previous session', () => {
    const rows = flagDuplicates([tx()], [fingerprintOf(tx())])
    expect(rows[0].duplicateOf).toBe('existing')
  })

  it('leaves a genuinely new row unflagged', () => {
    const rows = flagDuplicates([tx()], [fingerprintOf(tx({ amount: 99 }))])
    expect(rows[0].duplicateOf).toBeNull()
  })

  it('flags the repeat when the same file is dropped twice in one batch', () => {
    const rows = flagDuplicates([tx(), tx()], [])
    expect(rows.map(r => r.duplicateOf)).toEqual([null, 'batch'])
  })

  it('does not flag two genuinely different purchases on the same day', () => {
    const rows = flagDuplicates([tx(), tx({ amount: 4.2 })], [])
    expect(rows.map(r => r.duplicateOf)).toEqual([null, null])
  })

  it('flags — never drops — so the user can override', () => {
    // Two identical same-day purchases are real. The row must survive, just pre-skipped.
    const rows = flagDuplicates([tx(), tx()], [])
    expect(rows).toHaveLength(2)
  })

  it('attaches the fingerprint to every row for the commit payload', () => {
    const rows = flagDuplicates([tx()], [])
    expect(rows[0].fingerprint).toBe(fingerprintOf(tx()))
  })

  it('handles an empty batch', () => {
    expect(flagDuplicates([], [])).toEqual([])
    expect(flagDuplicates(undefined)).toEqual([])
  })
})

describe('flagDuplicates with per-file scope (the CSV path)', () => {
  const inFile = (fileName, sourceIndex, over = {}) =>
    tx({ fileName, sourceIndex, ...over })

  it('treats two identical rows inside one file as two real transactions', () => {
    // A monthly export is the bank's own ledger: two €10,40 train tickets on one day are two
    // journeys, and flagging the second would default real spending to skipped.
    const rows = flagDuplicates(
      [inFile('dec.csv', 0), inFile('dec.csv', 1)],
      [],
      { batchScope: 'per-file' },
    )
    expect(rows.map(r => r.duplicateOf)).toEqual([null, null])
  })

  it('still flags the same file added twice', () => {
    const rows = flagDuplicates(
      [inFile('dec.csv', 0), inFile('dec.csv', 0)],
      [],
      { batchScope: 'per-file' },
    )
    expect(rows.map(r => r.duplicateOf)).toEqual([null, 'batch'])
  })

  it('still flags a row repeated across two different files', () => {
    const rows = flagDuplicates(
      [inFile('dec.csv', 4), inFile('nov.csv', 9)],
      [],
      { batchScope: 'per-file' },
    )
    expect(rows.map(r => r.duplicateOf)).toEqual([null, 'batch'])
  })

  it('flags BOTH copies when two overlapping exports each list the same pair', () => {
    // December lists two identical €10,40 tickets; a Nov–Jan export lists the same two. The
    // real count is two, not four, so the second file's pair is fully covered.
    const rows = flagDuplicates(
      [inFile('dec.csv', 0), inFile('dec.csv', 5), inFile('nov-jan.csv', 3), inFile('nov-jan.csv', 8)],
      [],
      { batchScope: 'per-file' },
    )
    expect(rows.map(r => r.duplicateOf)).toEqual([null, null, 'batch', 'batch'])
  })

  it('does not flag the extra occurrence when one export lists more than the other', () => {
    // The overlapping export only covered one of the two tickets, so the second is still real.
    const rows = flagDuplicates(
      [inFile('nov-jan.csv', 3), inFile('dec.csv', 0), inFile('dec.csv', 5)],
      [],
      { batchScope: 'per-file' },
    )
    expect(rows.map(r => r.duplicateOf)).toEqual([null, 'batch', null])
  })

  it('does not flag unrelated rows that share a file name and position', () => {
    // Every KBC download is called the same thing, so two different files can both be
    // "export.csv". Position alone would flag the second file's rows one-for-one and default a
    // whole real month to skipped.
    const rows = flagDuplicates(
      [inFile('export.csv', 0), inFile('export.csv', 0, { amount: 4.2 })],
      [],
      { batchScope: 'per-file' },
    )
    expect(rows.map(r => r.duplicateOf)).toEqual([null, null])
  })

  it('still flags rows already in the database', () => {
    const rows = flagDuplicates(
      [inFile('dec.csv', 0)],
      [fingerprintOf(tx())],
      { batchScope: 'per-file' },
    )
    expect(rows[0].duplicateOf).toBe('existing')
  })

  it('leaves the default scope — the PDF path — unchanged', () => {
    expect(flagDuplicates([tx(), tx()], []).map(r => r.duplicateOf)).toEqual([null, 'batch'])
  })
})
