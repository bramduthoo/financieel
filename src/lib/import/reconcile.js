// Balance reconciliation for the CSV import (kbc-csv-import-background.md §4).
//
// BOTH CHECKS ARE SOFT. They warn; they never block the import and never drop a row. A failed
// check means "look at this", not "refuse" — the owner's call, because a real statement that
// trips a check is still the best record of what happened.
//
//   chain  — every row's Saldo must equal the previous balance plus its Bedrag. Stronger than
//            comparing only the endpoints: it names the FIRST row where the file and our parse
//            disagree, which is exactly where a layout drift or a mis-parsed amount shows up.
//   total  — opening + Σ Bedrag == closing, over ALL rows including the recurring ones. It is
//            computed from the parsed statement, never from preview rows, so nothing the user
//            includes or excludes can change the result.
//   drift  — a boundary balance the app already stored vs the one this export derives. Both
//            sides are bank truth, so a mismatch means an earlier import was mis-parsed or the
//            statement was partial — the drift detector this feature exists for.
//
// Deliberately NOT checked: the app's own computed balance. Σ wallet balances is not this bank
// account's balance in a wallet model (the €2000 monthly transfer to savings leaves the account
// entirely), so that comparison would fail on every correct import.
//
// Numbers come out structured, not pre-formatted: the banner renders them with formatMoney, so
// privacy mode applies and the lib stays display-free.

const CENT = 0.005

/**
 * @param {object} statement  a parsed kbcCsv statement
 * @param {{
 *   derivedSnapshots?: Array<{accountIban: string, boundaryDate: string, balance: number}>,
 *   storedSnapshots?: Array<{account_iban: string, boundary_date: string, balance: number|string}>,
 * }} [ctx]
 * @returns {{ ok: boolean, checks: Array<object> }}
 */
export function reconcile(statement, ctx = {}) {
  const { derivedSnapshots = [], storedSnapshots = [] } = ctx
  const rows = statement?.transactions ?? []

  const checks = []
  if (rows.length === 0) return { ok: true, checks }

  checks.push(chainCheck(statement, rows))
  checks.push(totalCheck(statement, rows))
  checks.push(...driftChecks(derivedSnapshots, storedSnapshots))

  return { ok: checks.every(c => c.passed), checks }
}

function chainCheck(statement, rows) {
  let running = statement.openingBalance
  for (const row of rows) {
    const expected = round2(running + row.signedAmount)
    if (Math.abs(expected - row.saldoAfter) > CENT) {
      return {
        id: 'chain',
        passed: false,
        label: 'Running balance',
        // Row numbers refer to the file, so the user can open the CSV and look at that line.
        row: { number: row.sourceIndex + 1, date: row.date, counterparty: row.counterparty },
        expected,
        actual: row.saldoAfter,
      }
    }
    running = row.saldoAfter
  }
  return { id: 'chain', passed: true, label: 'Running balance', rows: rows.length }
}

function totalCheck(statement, rows) {
  const sum = round2(rows.reduce((total, r) => total + r.signedAmount, 0))
  const expected = round2(statement.openingBalance + sum)
  return {
    id: 'total',
    passed: Math.abs(expected - statement.closingBalance) <= CENT,
    label: 'Opening plus transactions',
    opening: statement.openingBalance,
    sum,
    expected,
    actual: statement.closingBalance,
  }
}

function driftChecks(derived, stored) {
  return derived.flatMap(snapshot => {
    const previous = stored.find(s =>
      s.account_iban === snapshot.accountIban && s.boundary_date === snapshot.boundaryDate,
    )
    if (!previous) return []

    const storedBalance = Number(previous.balance)
    const passed = Math.abs(storedBalance - snapshot.balance) <= CENT
    return [{
      id: `drift:${snapshot.boundaryDate}`,
      passed,
      label: 'Stored month balance',
      boundaryDate: snapshot.boundaryDate,
      expected: storedBalance,
      actual: snapshot.balance,
    }]
  })
}

function round2(n) {
  return Math.round(n * 100) / 100
}
