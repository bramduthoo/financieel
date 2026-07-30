// KBC adapter — the "export" CSV (kbc-csv-import-background.md §2).
//
// ONE FILE = ONE MONTH of transactions, with a running `Saldo` per row. That makes this the
// first format in the pipeline with a real balance control (see reconcile.js); it is also why
// two behaviours only exist on this path: recurring-link matching and month-boundary snapshots.
//
// VERIFIED against the real anonymized export (42 rows, 2026-07-30):
//   - `;`-separated, UTF-8, no BOM, CR-only line terminators, 18 columns, header row present.
//   - Rows are newest-first, but NOT sorted by `Datum` (it inverts) and not by `Valuta` either.
//     The FILE's own order is the ledger order: the `Saldo` chain is consistent across all 42
//     rows in file order with zero breaks. So ledger order = reversed file order, and `Datum`
//     is used only as the transaction date. Never re-sort by `Datum` — it breaks the chain.
//   - `credit` / `debet` are populated on every row and hold `Bedrag` verbatim (credit
//     positive, debet negative), so direction is explicit rather than inferred.
//
// Columns are read BY HEADER NAME, never by position: KBC has changed column order before, and
// a silent one-column shift is the worst possible outcome for an importer.

import { parseKbcAmount, parseKbcCsvDate, counterpartyKey } from '../normalize.js'
import { parseDelimited } from '../csv.js'

export const BANK_ID = 'kbc'
export const BANK_LABEL = 'KBC'
export const FORMAT_ID = 'kbc-csv-export'

const DELIMITER = ';'

// Without these five nothing downstream is trustworthy: no date, no amount, no chain, no
// account. A missing one is refused with the header named, never worked around.
const REQUIRED_HEADERS = ['rekeningnummer', 'datum', 'omschrijving', 'bedrag', 'saldo']

// Present in every real export; their absence degrades a field but not the import.
const OPTIONAL_HEADERS = [
  'naam', 'munt', 'afschriftnummer', 'valuta', 'credit', 'debet',
  'rekeningnummer tegenpartij', 'bic tegenpartij', 'naam tegenpartij',
  'gestructureerde mededeling', 'vrije mededeling',
]

// "BETALING VIA BANCONTACT   31-12 31-12-2025 OM 13.55 UUR " — the type, then the booking
// day, then (card rows only) the payment timestamp. Everything after it is the merchant.
const PREAMBLE = /^(.*?)\s+(\d{2}-\d{2})\s+(?:(\d{2}-\d{2}-\d{4})\s+OM\s+(\d{2}\.\d{2})\s+UUR\s+)?/

// Where the merchant name stops on a card row. The earliest hit wins.
const MERCHANT_CUTS = [
  ' MET KBC-DEBETKAART',
  ' MET KBC',
  ' KAARTHOUDER:',
  ' INFO VAN DE HANDELAAR:',
]

// Standard Belgian structured communication — a payment reference, never a human note.
const STRUCTURED_REF = /^\+{3}\d{3}\/\d{4}\/\d{5}\+{3}$/

/**
 * How strongly this text looks like a KBC export CSV. Unlike the PDF path there is no
 * detectBank routing here (the import source is an explicit user choice), so this exists to
 * tell the user "that's not a KBC export" instead of failing deep inside the parser.
 * @returns {number} 0..1
 */
export function detect(text) {
  if (typeof text !== 'string' || !text.trim()) return 0
  const [header] = parseDelimited(text.slice(0, 2000), DELIMITER)
  if (!header) return 0
  const present = new Set(header.map(h => h.trim().toLowerCase()))
  return REQUIRED_HEADERS.every(h => present.has(h)) ? 1 : 0
}

/**
 * Parse one KBC export CSV.
 * @param {string} text
 * @returns {import('../types.js').ParsedStatement | import('../types.js').ParseFailure}
 */
export function parse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, reason: 'The file is empty.' }
  }

  const table = parseDelimited(text, DELIMITER)
  if (table.length === 0) return { ok: false, reason: 'The file is empty.' }

  const header = table[0].map(h => h.trim().toLowerCase())
  const index = new Map(header.map((name, i) => [name, i]))

  const missing = REQUIRED_HEADERS.filter(h => !index.has(h))
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `This does not look like a KBC export: the column${missing.length === 1 ? '' : 's'} `
        + `${missing.map(m => `"${m}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing.`,
    }
  }

  const body = table.slice(1)
  if (body.length === 0) return { ok: false, reason: 'The export contains no transactions.' }

  const warnings = []
  for (const name of OPTIONAL_HEADERS) {
    if (!index.has(name)) warnings.push(`The column "${name}" is missing — the matching field is left empty.`)
  }

  const parsed = []
  for (let i = 0; i < body.length; i++) {
    const cell = name => {
      const at = index.get(name)
      return at === undefined ? '' : (body[i][at] ?? '').trim()
    }
    // Row numbers are 1-based over the DATA rows, which is what the user sees in a spreadsheet
    // minus the header — close enough to point at, and unambiguous in an error message.
    const rowNo = i + 1

    // Reading by header name protects against a re-ordered export, but not against a row whose
    // own fields are shifted (an unescaped `;`, a stray quote swallowing the rest of the line, a
    // truncated download). A field count that disagrees with the header means the values no
    // longer line up with their columns, which is exactly the silent mis-parse this importer
    // must refuse.
    if (body[i].length !== header.length) {
      return {
        ok: false,
        reason: `Row ${rowNo} has ${body[i].length} fields but the header has ${header.length}. `
          + 'The file looks damaged — nothing was imported.',
      }
    }

    const date = parseKbcCsvDate(cell('datum'))
    if (date === null) {
      return { ok: false, reason: `Row ${rowNo}: could not read the date "${cell('datum')}".` }
    }

    const signedAmount = parseKbcAmount(cell('bedrag'))
    if (signedAmount === null) {
      return { ok: false, reason: `Row ${rowNo}: could not read the amount "${cell('bedrag')}".` }
    }

    // The whole balance control depends on every row's Saldo, so a missing one is refused
    // rather than skipped: a partially-read statement would reconcile against nothing.
    const saldoAfter = parseKbcAmount(cell('saldo'))
    if (saldoAfter === null) {
      return { ok: false, reason: `Row ${rowNo}: could not read the balance "${cell('saldo')}".` }
    }

    const { direction, warning: directionWarning } = resolveDirection({
      credit: cell('credit'),
      debet: cell('debet'),
      signedAmount,
      rowNo,
    })
    if (directionWarning) warnings.push(directionWarning)
    if (signedAmount === 0) warnings.push(`Row ${rowNo} has a zero amount.`)

    const description = cell('omschrijving')
    const { typeKeyword, channel, remainder } = splitDescription(description)
    const kind = classify(typeKeyword)

    // Two paths (background §2): transfers name the counterparty in its own column; card
    // payments leave it blank and bury the merchant in the description.
    const namedCounterparty = cell('naam tegenpartij')
    const counterparty = namedCounterparty || cutMerchant(remainder) || description
    if (!namedCounterparty && !cutMerchant(remainder)) {
      warnings.push(`Row ${rowNo}: could not isolate the counterparty — the full description is used.`)
    }

    const freeNote = cell('vrije mededeling')
    // A structured communication is a payment reference. KBC has its own column for it, but a
    // reference typed into the free field is treated the same way — kept off the note.
    const structuredReference = cell('gestructureerde mededeling')
      || (STRUCTURED_REF.test(freeNote) ? freeNote : '')

    parsed.push({
      date,
      amount: Math.abs(signedAmount),
      direction,
      counterparty,
      counterpartyKey: counterpartyKey(counterparty),
      counterpartyIban: cell('rekeningnummer tegenpartij').replace(/\s+/g, '') || null,
      counterpartyBic: cell('bic tegenpartij') || null,
      note: buildNote({ kind, counterparty, channel, freeNote, structuredReference }),
      typeKeyword: typeKeyword || null,
      channel,
      kind,
      structuredReference: structuredReference || null,
      raw: [body[i].join(DELIMITER)],
      // CSV-only fields. `sourceIndex` is the row's position in the FILE (0-based over data
      // rows) and is what makes the ledger order reproducible; `saldoAfter` + `signedAmount`
      // feed the balance chain in reconcile.js.
      sourceIndex: i,
      saldoAfter,
      signedAmount,
      valutaDate: parseKbcCsvDate(cell('valuta')),
      statementNumber: cell('afschriftnummer') || null,
      accountIban: cell('rekeningnummer').replace(/\s+/g, '') || null,
    })
  }

  // Ledger order = reversed file order (newest-first in the file). Not a date sort: `Datum`
  // is not monotonic in the real export and sorting by it breaks the Saldo chain.
  const transactions = [...parsed].reverse().map((tx, ledgerIndex) => ({ ...tx, ledgerIndex }))

  const accounts = new Set(transactions.map(t => t.accountIban).filter(Boolean))
  if (accounts.size > 1) {
    warnings.push(
      'This export mixes more than one account number. Balance checks and snapshots are '
      + 'skipped, because a single running balance cannot describe two accounts.',
    )
  }

  const first = transactions[0]
  const last = transactions.at(-1)

  return {
    bank: BANK_ID,
    format: FORMAT_ID,
    accountIban: first.accountIban,
    accountHolder: valueOf(table, index, 'naam') ?? null,
    currency: valueOf(table, index, 'munt') ?? null,
    // The balance BEFORE the oldest row, i.e. the opening balance of the covered period.
    openingBalance: round2(first.saldoAfter - first.signedAmount),
    closingBalance: last.saldoAfter,
    singleAccount: accounts.size === 1,
    transactions,
    warnings,
  }
}

// Direction is explicit in the export; the Bedrag sign is only a fallback, and a disagreement
// between the two is surfaced rather than silently resolved (it would mean a layout change).
function resolveDirection({ credit, debet, signedAmount, rowNo }) {
  if (credit && debet) {
    return {
      direction: signedAmount < 0 ? 'debit' : 'credit',
      warning: `Row ${rowNo} fills both the credit and debet column — the amount's sign was used instead.`,
    }
  }
  if (credit) {
    return {
      direction: 'credit',
      warning: signedAmount < 0
        ? `Row ${rowNo} is in the credit column but the amount is negative.`
        : null,
    }
  }
  if (debet) {
    return {
      direction: 'debit',
      warning: signedAmount > 0
        ? `Row ${rowNo} is in the debet column but the amount is positive.`
        : null,
    }
  }
  return { direction: signedAmount < 0 ? 'debit' : 'credit', warning: null }
}

// "BETALING VIA BANCONTACT 31-12 31-12-2025 OM 13.55 UUR DELHAIZE ... " →
// { typeKeyword: 'BETALING VIA BANCONTACT', channel: 'Bancontact', remainder: 'DELHAIZE ...' }
function splitDescription(description) {
  const m = PREAMBLE.exec(description)
  if (!m) return { typeKeyword: '', channel: null, remainder: description }

  const typeKeyword = m[1].trim()
  const viaMatch = /^BETALING VIA\s+(.+)$/i.exec(typeKeyword)
  return {
    typeKeyword,
    channel: viaMatch ? titleCase(viaMatch[1]) : null,
    remainder: description.slice(m[0].length),
  }
}

function cutMerchant(remainder) {
  let end = remainder.length
  for (const marker of MERCHANT_CUTS) {
    const at = remainder.indexOf(marker)
    if (at >= 0 && at < end) end = at
  }
  return remainder.slice(0, end).trim()
}

function classify(typeKeyword) {
  const t = (typeKeyword || '').toUpperCase()
  if (t.startsWith('BETALING VIA')) return 'card'
  if (t.includes('OVERSCHRIJVING')) return 'transfer'
  if (t.includes('DOMICILI')) return 'direct-debit'
  return 'unknown'
}

// Mirrors the PDF adapter's note shape so the same transaction reads identically whichever
// source it came from: the free mededeling when there is one, else merchant + channel.
function buildNote({ kind, counterparty, channel, freeNote, structuredReference }) {
  const humanNote = freeNote && freeNote !== structuredReference ? freeNote : ''
  if (humanNote) return humanNote
  if (kind === 'card') return channel ? `${counterparty} · via ${channel}` : counterparty
  return counterparty
}

// A first-data-row value for a column that is constant across the export (holder, currency).
function valueOf(table, index, name) {
  const at = index.get(name)
  if (at === undefined || !table[1]) return null
  return (table[1][at] ?? '').trim() || null
}

// Cents, so an opening balance derived by subtraction can't carry float dust into a
// reconciliation comparison.
function round2(n) {
  return Math.round(n * 100) / 100
}

function titleCase(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}
