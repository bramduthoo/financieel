// Turns extracted text from a BATCH of files into preview rows.
//
// Pure on purpose: the page only does File → text (via extractText, the impure edge) and
// hands the results here, so all batch behaviour — detection, per-file failure isolation,
// suggestions, dedupe, defaults — is unit-testable.
//
// One PDF = one transaction in the KBC mobile format, but nothing here assumes that: an
// adapter returning several transactions merges into the same flat preview table.

import { detectBank } from './detectBank.js'
import { suggestWallet } from './suggestWallet.js'
import { flagDuplicates } from './dedupe.js'

/**
 * @param {Array<{fileName: string, text: string}>} files
 * @param {{
 *   preferredBank?: string|null,
 *   wallets?: Array<object>,
 *   mappings?: Array<{counterparty_key: string, wallet_id: string}>,
 *   existingFingerprints?: Iterable<string>,
 * }} ctx
 * @returns {{ rows: Array<object>, errors: Array<{fileName: string, reason: string}>, warnings: Array<{fileName: string, message: string}> }}
 */
// Row ids must be unique across SEPARATE buildRows calls, because the page appends new
// files to an existing preview. A per-call index would collide (same file dropped twice
// ⇒ two rows sharing an id ⇒ editing one silently edits the other).
let rowSeq = 0

export function buildRows(files, ctx = {}) {
  const { preferredBank = null, wallets = [], mappings = [], existingFingerprints = [] } = ctx

  const parsed = []
  const errors = []
  const warnings = []

  for (const file of files ?? []) {
    const { adapter, bank } = detectBank(file.text, { preferredBank })
    if (!adapter) {
      // A statement we have no adapter for is REPORTED, never handed to whichever adapter
      // happens to be preferred — misparsing it silently would be far worse than refusing.
      errors.push({ fileName: file.fileName, reason: 'Not a recognised bank statement.' })
      continue
    }

    const statement = adapter.parse(file.text)
    if (statement.ok === false) {
      errors.push({ fileName: file.fileName, reason: statement.reason })
      continue
    }

    for (const message of statement.warnings ?? []) {
      warnings.push({ fileName: file.fileName, message })
    }

    for (const tx of statement.transactions) {
      parsed.push({
        ...tx,
        fileName: file.fileName,
        bank,
        accountIban: statement.accountIban,
      })
    }
  }

  // Fingerprint + duplicate flags need the whole batch at once (the same file dropped
  // twice is only detectable across files).
  const flagged = flagDuplicates(parsed, existingFingerprints)

  return { rows: decorateRows(flagged, { wallets, mappings }), errors, warnings }
}

/**
 * Turns flagged transactions into preview rows. Shared by both import sources so the row
 * defaults — id, suggestion, include, credit mode — are defined exactly once.
 *
 * @param {Array<object>} flagged  rows that already carry `fingerprint` + `duplicateOf`
 * @param {{ wallets?: Array<object>, mappings?: Array<object> }} ctx
 */
export function decorateRows(flagged, { wallets = [], mappings = [] } = {}) {
  return (flagged ?? []).map(row => {
    const suggestion = suggestWallet(row, { mappings, wallets })
    return {
      ...row,
      id: `row-${rowSeq++}`,
      suggestion,
      // Pre-filled but visibly marked; an unmatched row stays empty so the user must choose.
      walletId: suggestion?.walletId ?? '',
      include: shouldInclude(row),
      // Credits are hybrid (pdf-import-plan.md §3): default to a plain refund credit,
      // because most imported credits here are peer transfers and refunds, not salary.
      creditMode: row.direction === 'credit' ? 'refund' : null,
    }
  })
}

/**
 * Whether a row is committed by default. ONE definition, used both when rows are built and when
 * the user answers a recurring question — a row can be BOTH already-imported and a recurring
 * candidate, and answering the (blocking) question must not quietly undo the duplicate skip.
 *
 * A duplicate defaults to skipped but stays visible and overridable by the checkbox; a row a
 * recurring rule accounts for is never pre-included, because committing it would double-count
 * against the recurring flow that posts it.
 */
export function shouldInclude(row) {
  if (row?.duplicateOf) return false
  return !isRecurringHandled(row)
}

/**
 * True while a row is claimed by a recurring rule — recognised, or awaiting the user's answer.
 * Such a row is NEVER committed: the recurring flow posts that money.
 *
 * Answering "this is not that rule" (`rejected`) releases the row: it becomes an ordinary
 * importable transaction again.
 */
export function isRecurringHandled(row) {
  const verdict = row?.recurring
  if (!verdict || verdict.rejected) return false
  const { state } = verdict
  return state === 'recognised' || state === 'deviation' || state === 'needs-confirmation'
}

/**
 * The payload for the import_transactions RPC: included DEBIT and REFUND-CREDIT rows only.
 * "Log as income" rows are excluded — they go through the existing income path, which has
 * its own atomic distribution write. Rows with no wallet chosen are excluded too.
 */
export function toCommitItems(rows) {
  return (rows ?? [])
    // The recurring guard is belt AND braces: such rows already arrive excluded, but a
    // double-posted salary is the one mistake this feature must make impossible.
    .filter(r => r.include && r.walletId && !isIncomeRow(r) && !isRecurringHandled(r))
    .map(r => ({
      wallet_id: r.walletId,
      amount: r.amount,
      direction: r.direction,
      date: r.date,
      note: r.note,
      fingerprint: r.fingerprint,
      counterparty_key: r.counterpartyKey,
    }))
}

/** Included credit rows the user routed to the income flow instead of a wallet credit. */
export function toIncomeRows(rows) {
  return (rows ?? []).filter(r => r.include && isIncomeRow(r) && !isRecurringHandled(r))
}

/** A credit the user routed to the income flow instead of a plain wallet credit. */
export function isIncomeRow(row) {
  return row.direction === 'credit' && row.creditMode === 'income'
}
