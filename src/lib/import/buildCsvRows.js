// Turns KBC export CSVs into preview rows — the CSV counterpart of buildRows.js.
//
// Pure on purpose: the page only does File → text and hands the results here, so every batch
// behaviour (per-file failure isolation, dedupe, recurring matching, reconciliation, snapshot
// derivation) is unit-testable.
//
// The adapter is called DIRECTLY rather than through detectBank: the import source is an
// explicit user choice on the page, and putting a CSV into the PDF adapter registry would risk
// one format being handed to the other's parser. The adapter still checks its own header and
// refuses anything that is not a KBC export.

import { parse as parseKbcCsv, detect as detectKbcCsv } from './banks/kbcCsv.js'
import { flagDuplicates } from './dedupe.js'
import { decorateRows } from './buildRows.js'
import { matchRecurring } from './matchRecurring.js'
import { reconcile } from './reconcile.js'
import { deriveSnapshots } from './monthlySnapshots.js'

/**
 * @param {Array<{fileName: string, text: string}>} files
 * @param {{
 *   wallets?: Array<object>,
 *   mappings?: Array<{counterparty_key: string, wallet_id: string}>,
 *   existingFingerprints?: Iterable<string>,
 *   incomeRules?: Array<object>,
 *   expenseRules?: Array<object>,
 *   links?: Array<object>,
 *   storedSnapshots?: Array<object>,
 * }} ctx
 * @returns {{
 *   rows: Array<object>,
 *   statements: Array<object>,
 *   checks: Array<object>,
 *   snapshots: Array<object>,
 *   coverage: Array<object>,
 *   errors: Array<{fileName: string, reason: string}>,
 *   warnings: Array<{fileName: string, message: string}>,
 * }}
 */
export function buildCsvRows(files, ctx = {}) {
  const {
    wallets = [],
    mappings = [],
    existingFingerprints = [],
    incomeRules = [],
    expenseRules = [],
    links = [],
    storedSnapshots = [],
  } = ctx

  const parsed = []
  const statements = []
  const checks = []
  const snapshots = []
  const coverage = []
  const errors = []
  const warnings = []
  const seenBoundaries = new Set()

  for (const file of files ?? []) {
    if (detectKbcCsv(file.text) === 0) {
      errors.push({ fileName: file.fileName, reason: 'Not a recognised KBC export CSV.' })
      continue
    }

    const statement = parseKbcCsv(file.text)
    if (statement.ok === false) {
      errors.push({ fileName: file.fileName, reason: statement.reason })
      continue
    }

    for (const message of statement.warnings ?? []) {
      warnings.push({ fileName: file.fileName, message })
    }

    // The balance controls and the snapshots are per FILE: each export carries its own
    // continuous Saldo chain, and merging two files' rows would invent a chain that never
    // existed.
    const derived = deriveSnapshots(statement)
    for (const message of derived.warnings) {
      warnings.push({ fileName: file.fileName, message })
    }
    const result = reconcile(statement, {
      derivedSnapshots: derived.snapshots,
      storedSnapshots,
    })
    for (const check of result.checks) {
      checks.push({ ...check, fileName: file.fileName })
    }

    statements.push({ fileName: file.fileName, statement })
    // ONE snapshot per (account, boundary). Two overlapping exports can both prove the same
    // boundary, and the snapshot row is unique on it — sending the key twice in one upsert is a
    // Postgres error, so the first file to prove a boundary keeps it.
    for (const snapshot of derived.snapshots) {
      const key = `${snapshot.accountIban}|${snapshot.boundaryDate}`
      if (!seenBoundaries.has(key)) {
        seenBoundaries.add(key)
        snapshots.push(snapshot)
      }
    }
    if (derived.coverage) coverage.push({ fileName: file.fileName, ...derived.coverage })

    for (const tx of statement.transactions) {
      parsed.push({
        ...tx,
        fileName: file.fileName,
        bank: statement.bank,
        // The ROW's own account, not the statement's first one: the fingerprint embeds the IBAN,
        // and stamping every row of a mixed-account export with one account would persist a key
        // that never matches the same transaction re-imported from its own export.
        accountIban: tx.accountIban ?? statement.accountIban,
      })
    }
  }

  // 'per-file' scope: inside one export the bank's own ledger is authoritative, so two
  // identical rows are two real transactions, not a duplicate (dedupe.js).
  const flagged = flagDuplicates(parsed, existingFingerprints, { batchScope: 'per-file' })
  const matched = matchRecurring(flagged, { incomeRules, expenseRules, links })

  return {
    rows: decorateRows(matched, { wallets, mappings }),
    statements,
    checks,
    snapshots,
    coverage,
    errors,
    warnings,
  }
}

/**
 * Rows still waiting for the user's answer. They block the commit: a recurring question left
 * unanswered would otherwise leave a real transaction neither imported nor accounted for.
 */
export function unansweredRecurring(rows) {
  return (rows ?? []).filter(r => {
    const state = r.recurring?.state
    return (state === 'needs-confirmation' || state === 'deviation') && !r.recurring.answered
  })
}

/**
 * The links to persist after a commit: every confirmed answer, plus a touch for each silently
 * recognised row so `last_seen_at` stays meaningful.
 *
 * `rule` is the rule as matched. When a deviation also updates the rule's amount, the app
 * versions that rule into a NEW row, so the caller re-points the link at the new id after the
 * versioning write — the link must never keep pointing at the archived version.
 */
export function toLinkUpserts(rows) {
  const upserts = (rows ?? []).flatMap(row => {
    const verdict = row.recurring
    if (!verdict || verdict.rejected) return []

    const rule = verdict.confirmedRule ?? (verdict.state === 'recognised' ? verdict.rule : null)
    if (!rule) return []

    // "Keep the rule" means the user called this month a one-off, so the link keeps the amount
    // it had; every other confirmation teaches the amount the statement actually showed.
    const keepsOldAmount = verdict.state === 'deviation' && !verdict.updateRuleAmount
    const linkedAmount = keepsOldAmount ? (verdict.linkedAmount ?? rule.amount) : row.amount

    return [{
      // `explicit` only picks a winner below; `write` is what gets persisted.
      explicit: Boolean(verdict.confirmedRule),
      write: {
        rule,
        counterparty_key: row.counterpartyKey,
        direction: row.direction,
        linked_amount: linkedAmount,
        account_iban: row.accountIban ?? null,
        existingLinkId: verdict.linkId ?? null,
      },
    }]
  })

  // ONE upsert per link identity. A weekly rule recognises four rows in a month, and a link is
  // unique on (user_id, counterparty_key, direction) — sending the same conflict key twice in
  // one statement is a Postgres error ("cannot affect row a second time"), which would lose the
  // link entirely. An explicitly confirmed answer beats a passive recognition touch.
  const byIdentity = new Map()
  for (const candidate of upserts) {
    const key = `${candidate.write.counterparty_key}|${candidate.write.direction}`
    const existing = byIdentity.get(key)
    if (!existing || (candidate.explicit && !existing.explicit)) byIdentity.set(key, candidate)
  }
  return [...byIdentity.values()].map(candidate => candidate.write)
}

/**
 * The rules whose amount the user chose to update from a deviation row.
 *
 * ONE update per rule. A weekly rule can deviate several times in a month, and a multi-month
 * export can deviate once per month; re-pricing the same rule twice would archive it and leave
 * TWO active successors sharing a `parent_rule_id` (and, for an income rule, two live recurring
 * incomes). The newest row wins, because that is the amount in force now.
 */
export function toRuleAmountUpdates(rows) {
  const updates = (rows ?? [])
    .filter(r => r.recurring?.state === 'deviation' && r.recurring.answered && r.recurring.updateRuleAmount)
    .map(r => ({
      rule: r.recurring.confirmedRule ?? r.recurring.rule,
      amount: r.amount,
      date: r.date,
      counterpartyKey: r.counterpartyKey,
    }))

  const byRule = new Map()
  for (const update of updates) {
    const existing = byRule.get(update.rule.id)
    if (!existing || update.date > existing.date) byRule.set(update.rule.id, update)
  }
  return [...byRule.values()]
}
