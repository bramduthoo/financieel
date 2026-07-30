// Month-boundary balance snapshots derived from a KBC export CSV
// (kbc-csv-import-background.md §4).
//
// A boundary is the 1st of a month at 00:00, which is simultaneously the END of the previous
// month and the START of the next. That single key is the whole point: December's import writes
// 2025-12-01 (its opening) and 2026-01-01 (its closing); January's import writes 2026-01-01
// again from its own opening — and a disagreement between the two IS the drift signal the
// feature exists to produce.
//
// Balances are derived from the running `Saldo`, order-independently: the balance at a boundary
// is the opening balance plus every row dated before it. That holds even though `Datum` is not
// monotonic in the export (see banks/kbcCsv.js), because it never relies on row order.
//
// Pure: no clock, no DB. The caller persists what comes out.

/**
 * @param {object} statement  a parsed kbcCsv statement
 * @returns {{
 *   snapshots: Array<{ accountIban: string, boundaryDate: string, balance: number, kind: 'opening'|'closing'|'interior' }>,
 *   coverage: { fromDate: string, toDate: string, months: string[] } | null,
 *   warnings: string[]
 * }}
 */
export function deriveSnapshots(statement) {
  const rows = statement?.transactions ?? []
  if (rows.length === 0) return { snapshots: [], coverage: null, warnings: [] }

  // One running balance cannot describe two accounts, so a mixed export gets no snapshots at
  // all rather than a plausible-looking wrong number.
  if (statement.singleAccount === false || !statement.accountIban) {
    return {
      snapshots: [],
      coverage: null,
      warnings: ['No balance snapshot was recorded: this export does not cover a single account.'],
    }
  }

  const dates = rows.map(r => r.date).sort()
  const months = [...new Set(dates.map(monthOf))].sort()
  const coverage = { fromDate: dates[0], toDate: dates.at(-1), months }

  const warnings = []
  const snapshots = []
  const at = boundary => balanceBefore(statement, boundary)

  // Interior boundaries are PROVABLE: the export contains rows on both sides, so the balance
  // at that moment is fully determined by the file.
  for (const month of months.slice(1)) {
    snapshots.push({
      accountIban: statement.accountIban,
      boundaryDate: firstOf(month),
      balance: at(firstOf(month)),
      kind: 'interior',
    })
  }

  if (months.length === 1) {
    // A single-month export is the normal case and the only one where the outer boundaries can
    // be taken as the month's own start and end.
    snapshots.unshift({
      accountIban: statement.accountIban,
      boundaryDate: firstOf(months[0]),
      balance: statement.openingBalance,
      kind: 'opening',
    })
    snapshots.push({
      accountIban: statement.accountIban,
      boundaryDate: firstOf(nextMonth(months[0])),
      balance: statement.closingBalance,
      kind: 'closing',
    })
  } else {
    // The outer edges of a multi-month export cannot be proven to be month boundaries — the
    // file may start or stop mid-month — so they are skipped rather than guessed.
    warnings.push(
      `This export covers ${months.length} months (${months[0]} to ${months.at(-1)}). `
      + `Only the ${snapshots.length} month ${snapshots.length === 1 ? 'boundary' : 'boundaries'} `
      + 'inside that range could be recorded.',
    )
  }

  return { snapshots, coverage, warnings }
}

/** The balance the moment before `boundaryDate` (an ISO 'yyyy-MM-01'). */
export function balanceBefore(statement, boundaryDate) {
  const sum = (statement.transactions ?? [])
    .filter(r => r.date < boundaryDate)
    .reduce((total, r) => total + r.signedAmount, 0)
  return round2(statement.openingBalance + sum)
}

function monthOf(isoDate) {
  return isoDate.slice(0, 7)
}

function firstOf(month) {
  return `${month}-01`
}

function nextMonth(month) {
  const [year, m] = month.split('-').map(Number)
  return m === 12
    ? `${year + 1}-01`
    : `${year}-${String(m + 1).padStart(2, '0')}`
}

function round2(n) {
  return Math.round(n * 100) / 100
}
