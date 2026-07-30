import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from './banks/kbcCsv.js'
import { deriveSnapshots, balanceBefore } from './monthlySnapshots.js'

const CSV = readFileSync(
  new URL('../../../test-fixtures/kbc-csv/monthly-export-01.csv', import.meta.url),
  'utf8',
)

const statement = () => parse(CSV)

describe('a single-month export', () => {
  it('records both boundaries: the month start and the next month start', () => {
    const { snapshots } = deriveSnapshots(statement())
    expect(snapshots).toEqual([
      {
        accountIban: 'BE71096123456789',
        boundaryDate: '2025-12-01',
        balance: 476.63,
        kind: 'opening',
      },
      {
        accountIban: 'BE71096123456789',
        boundaryDate: '2026-01-01',
        balance: 606.22,
        kind: 'closing',
      },
    ])
  })

  it('rolls the year over on a December export', () => {
    expect(deriveSnapshots(statement()).snapshots.at(-1).boundaryDate).toBe('2026-01-01')
  })

  it('reports the covered range so a partial-month export is visible to the user', () => {
    expect(deriveSnapshots(statement()).coverage).toEqual({
      fromDate: '2025-12-01',
      toDate: '2025-12-31',
      months: ['2025-12'],
    })
  })

  it('needs no warning', () => {
    expect(deriveSnapshots(statement()).warnings).toEqual([])
  })
})

describe('boundary balances', () => {
  it('sums every row dated before the boundary, independent of row order', () => {
    const s = statement()
    expect(balanceBefore(s, '2025-12-01')).toBe(476.63)
    expect(balanceBefore(s, '2026-01-01')).toBe(606.22)
    // Mid-month: the balance before 12 December, derived by summing, must equal the Saldo the
    // bank printed on the LAST row dated 11 December — the €10,80 De Lords payment, saldo
    // 272,71 (three rows share that date; only the last one in ledger order is the boundary).
    expect(balanceBefore(s, '2025-12-12')).toBe(272.71)
    const eleventh = s.transactions.filter(t => t.date === '2025-12-11').at(-1)
    expect(eleventh.saldoAfter).toBe(272.71)
  })
})

describe('a multi-month export', () => {
  const twoMonths = () => {
    // Reuse the real statement's shape but re-date the oldest rows into November, so the
    // interior boundary (1 December) is provable and the outer ones are not.
    const lines = CSV.split('\r')
    const header = lines[0].split(';').map(h => h.trim())
    const dateAt = header.indexOf('Datum')
    const moved = lines.map((line, i) => {
      if (i === 0 || !line.trim() || i < 38) return line
      const cells = line.split(';')
      cells[dateAt] = cells[dateAt].replace('/12/2025', '/11/2025')
      return cells.join(';')
    })
    return parse(moved.join('\r'))
  }

  it('records only the interior boundary and says which ones it skipped', () => {
    const { snapshots, warnings } = deriveSnapshots(twoMonths())
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({ boundaryDate: '2025-12-01', kind: 'interior' })
    expect(warnings.join(' ')).toContain('covers 2 months')
  })

  it('derives that interior balance exactly from the running balance', () => {
    const s = twoMonths()
    expect(deriveSnapshots(s).snapshots[0].balance).toBe(balanceBefore(s, '2025-12-01'))
  })
})

describe('refusals', () => {
  it('records nothing for a mixed-account export', () => {
    const s = statement()
    const mixed = { ...s, singleAccount: false }
    const { snapshots, warnings } = deriveSnapshots(mixed)
    expect(snapshots).toEqual([])
    expect(warnings.join(' ')).toContain('single account')
  })

  it('records nothing for an empty statement', () => {
    expect(deriveSnapshots({ transactions: [] })).toEqual({
      snapshots: [], coverage: null, warnings: [],
    })
    expect(deriveSnapshots(null).snapshots).toEqual([])
  })
})
