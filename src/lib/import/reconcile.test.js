import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from './banks/kbcCsv.js'
import { reconcile } from './reconcile.js'
import { deriveSnapshots } from './monthlySnapshots.js'

const CSV = readFileSync(
  new URL('../../../test-fixtures/kbc-csv/monthly-export-01.csv', import.meta.url),
  'utf8',
)

const statement = () => parse(CSV)

/** Rewrites one field of one data row of the real export, to break it on purpose. */
function withEdit(rowNo, column, value) {
  const lines = CSV.split('\r')
  const at = lines[0].split(';').map(h => h.trim()).indexOf(column)
  const cells = lines[rowNo].split(';')
  cells[at] = value
  lines[rowNo] = cells.join(';')
  return lines.join('\r')
}

describe('the real export', () => {
  it('passes both internal checks', () => {
    const result = reconcile(statement())
    expect(result.ok).toBe(true)
    expect(result.checks.find(c => c.id === 'chain')).toMatchObject({ passed: true, rows: 42 })
    expect(result.checks.find(c => c.id === 'total')).toMatchObject({
      passed: true,
      opening: 476.63,
      sum: 129.59,
      expected: 606.22,
      actual: 606.22,
    })
  })
})

describe('a broken statement', () => {
  it('fails the chain check and names the first bad row', () => {
    // Row 7 is the €10,76 Colruyt payment; changing the amount desynchronises every Saldo
    // above it, which is exactly the shape a mis-parsed amount would have.
    const broken = parse(withEdit(7, 'Bedrag', '-11,76'))
    const result = reconcile(broken)

    expect(result.ok).toBe(false)
    const chain = result.checks.find(c => c.id === 'chain')
    expect(chain.passed).toBe(false)
    expect(chain.row.number).toBe(7)
    expect(chain.row.counterparty).toContain('COLRUYT')
    expect(chain.expected).not.toBe(chain.actual)
  })

  it('fails the total check when a row is missing from the file', () => {
    const lines = CSV.split('\r')
    lines.splice(20, 1)                       // drop one mid-month row entirely
    const result = reconcile(parse(lines.join('\r')))

    expect(result.ok).toBe(false)
    expect(result.checks.find(c => c.id === 'total').passed).toBe(false)
  })

  it('reports the check as failed without throwing or dropping rows', () => {
    const broken = parse(withEdit(3, 'Saldo', '999,99'))
    expect(broken.transactions).toHaveLength(42)
    expect(reconcile(broken).ok).toBe(false)
  })
})

describe('drift against stored snapshots', () => {
  const derived = () => deriveSnapshots(statement()).snapshots

  it('passes when a stored boundary agrees', () => {
    const result = reconcile(statement(), {
      derivedSnapshots: derived(),
      storedSnapshots: [
        { account_iban: 'BE71096123456789', boundary_date: '2025-12-01', balance: '476.63' },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.checks.find(c => c.id === 'drift:2025-12-01').passed).toBe(true)
  })

  it('fails and reports both numbers when a stored boundary disagrees', () => {
    const result = reconcile(statement(), {
      derivedSnapshots: derived(),
      storedSnapshots: [
        { account_iban: 'BE71096123456789', boundary_date: '2026-01-01', balance: '600.00' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.checks.find(c => c.id === 'drift:2026-01-01')).toMatchObject({
      passed: false,
      expected: 600,
      actual: 606.22,
    })
  })

  it('says nothing about a boundary that has never been stored', () => {
    const result = reconcile(statement(), { derivedSnapshots: derived(), storedSnapshots: [] })
    expect(result.checks.some(c => c.id.startsWith('drift'))).toBe(false)
    expect(result.ok).toBe(true)
  })

  it('ignores a stored boundary for a different account', () => {
    const result = reconcile(statement(), {
      derivedSnapshots: derived(),
      storedSnapshots: [
        { account_iban: 'BE00000000000000', boundary_date: '2025-12-01', balance: '1,00' },
      ],
    })
    expect(result.ok).toBe(true)
  })
})

describe('empty input', () => {
  it('reports no checks rather than a failure', () => {
    expect(reconcile(null)).toEqual({ ok: true, checks: [] })
    expect(reconcile({ transactions: [] })).toEqual({ ok: true, checks: [] })
  })
})
