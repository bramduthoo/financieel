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
 * `batchScope` decides what a repeat WITHIN the batch means, because the two import sources
 * differ on that:
 *   'batch'     (default, the PDF path) — one file = one transaction, so two identical rows
 *               mean the same PDF was dropped twice. Flag the repeat.
 *   'per-file'  (the CSV path) — one file = the bank's own month-long ledger. Three cases have
 *               to stay apart, and only the file each row came from can tell them apart:
 *                 · two identical rows INSIDE one export = two real transactions (two €10,40
 *                   train tickets on one day) → never flagged; flagging them would default
 *                   real spending to skipped
 *                 · the same export added twice = the same rows again → flagged, recognised by
 *                   a row ORIGIN (file + position in that file) appearing twice
 *                 · one transaction present in two overlapping exports → flagged, recognised
 *                   by one fingerprint appearing under two different file names
 *
 * @param {Array<object>} rows  transactions already carrying `accountIban`
 * @param {Iterable<string>} existingFingerprints  fingerprints already in the DB
 * @param {{ batchScope?: 'batch'|'per-file' }} [opts]
 */
export function flagDuplicates(rows, existingFingerprints = [], { batchScope = 'batch' } = {}) {
  const existing = new Set(existingFingerprints)
  const seenInBatch = new Set()
  const seenOrigins = new Set()
  // fingerprint → (fileName → how many times that file listed it)
  const countsByFingerprint = new Map()

  return (rows ?? []).map(row => {
    const fingerprint = fingerprintOf(row)
    const fileName = row.fileName ?? ''

    let duplicateOf = null
    if (existing.has(fingerprint)) {
      duplicateOf = 'existing'
    } else if (batchScope === 'per-file') {
      // The origin includes the FINGERPRINT as well as the file and position: KBC names every
      // download the same thing, so two genuinely different files can both be "export.csv" and
      // position alone would flag their rows one-for-one.
      const origin = `${fingerprint}|${fileName}|${row.sourceIndex ?? ''}`
      const perFile = countsByFingerprint.get(fingerprint) ?? new Map()

      if (seenOrigins.has(origin)) {
        // Same row of the same file again ⇒ that file was added twice.
        duplicateOf = 'batch'
      } else {
        // Each export is an authoritative ledger, so the number of REAL transactions with this
        // fingerprint is the most any single file lists — not the sum across overlapping files.
        // Occurrence N in this file is a duplicate once some other file has already listed N.
        const occurrence = (perFile.get(fileName) ?? 0) + 1
        const maxElsewhere = Math.max(
          0,
          ...[...perFile.entries()].filter(([f]) => f !== fileName).map(([, n]) => n),
        )
        if (occurrence <= maxElsewhere) duplicateOf = 'batch'

        perFile.set(fileName, occurrence)
        countsByFingerprint.set(fingerprint, perFile)
      }

      seenOrigins.add(origin)
    } else if (seenInBatch.has(fingerprint)) {
      duplicateOf = 'batch'
    }

    seenInBatch.add(fingerprint)
    return { ...row, fingerprint, duplicateOf }
  })
}
