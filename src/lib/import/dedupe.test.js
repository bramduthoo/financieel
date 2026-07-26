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
