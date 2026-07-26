// Per-transaction duplicate detection (pdf-import-plan.md §7).
//
// This format has no statement-level ledger to check against (no volgnummer), so dedupe is
// entirely per-transaction. A hit FLAGS the row and defaults it to skipped — it never
// blocks: two genuinely identical same-day purchases do happen, so the user can override.

/**
 * The stored fingerprint. Deliberately a plain composite key rather than a hash: it is
 * collision-free, debuggable in the DB, and reveals nothing that `transactions.note`
 * doesn't already hold behind the same RLS policies.
 *
 * @param {{accountIban: string|null, date: string, amount: number, direction: string, counterpartyKey: string}} tx
 * @returns {string}
 */
export function fingerprintOf(tx) {
  return [
    tx.accountIban ?? '',
    tx.date,
    Number(tx.amount).toFixed(2),
    tx.direction,
    tx.counterpartyKey ?? '',
  ].join('|')
}

/**
 * Adds `fingerprint` + `duplicateOf` to each row.
 *
 * `duplicateOf` is `'existing'` (already imported in a previous session), `'batch'` (the
 * same file was dropped twice in THIS batch), or null. The first occurrence within a batch
 * is never flagged — only its repeats are.
 *
 * @param {Array<object>} rows  transactions already carrying `accountIban`
 * @param {Iterable<string>} existingFingerprints  fingerprints already in the DB
 */
export function flagDuplicates(rows, existingFingerprints = []) {
  const existing = new Set(existingFingerprints)
  const seenInBatch = new Set()

  return (rows ?? []).map(row => {
    const fingerprint = fingerprintOf(row)

    let duplicateOf = null
    if (existing.has(fingerprint)) duplicateOf = 'existing'
    else if (seenInBatch.has(fingerprint)) duplicateOf = 'batch'

    seenInBatch.add(fingerprint)
    return { ...row, fingerprint, duplicateOf }
  })
}
