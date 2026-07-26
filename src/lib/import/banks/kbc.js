// KBC adapter — "Export KBC Mobile" per-transaction PDF (kbc-adapter-spec.md).
//
// ONE PDF = ONE TRANSACTION. This is not the classic monthly uittreksel: there is no
// beginsaldo/eindsaldo and no volgnummer, so there is NO reconciliation gate here. That
// mechanism belongs to a future classic-uittreksel adapter, not this one.
//
// Confirmed by fixtures: card payment (physical + virtual) and transfer (in/out).
// Domiciliëring has no fixture yet — it is parsed for its COMMON fields only and tagged;
// its sub-layout is deliberately not invented.

import { parseKbcAmount, parseKbcDate, parseIbanLine, counterpartyKey } from '../normalize.js'

export const BANK_ID = 'kbc'
export const BANK_LABEL = 'KBC'
export const FORMAT_ID = 'kbc-mobile-export'

// Footer string present in every file of this format — the strongest detection signal.
const FOOTER_MARKER = 'Export KBC Mobile'

// The single transaction line: date, free-text counterparty, signed amount, currency.
// Amount requires a comma decimal, so a counterparty containing dots ("N.V.") can't be
// mistaken for it. No sign = credit (adapter spec §3b) — the sign is authoritative.
//
// The currency token is OPTIONAL: it renders superscript in the PDF, so its baseline can
// sit far enough above the row for line reconstruction to bucket it onto its own line. If
// it were required, that would fail the whole file with a misleading "not a KBC export".
const TXN_LINE = /^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})(?:\s+([A-Z]{3}))?$/

// Detail-block labels whose VALUE is on the following line. The block gains and loses
// labels by payment type (the virtual-card fixture has one the physical card lacks), so
// this is parsed as label/value pairs — never by fixed line offsets (adapter spec §3c).
const DETAIL_LABELS = new Set([
  'Datum',
  'Debetkaart',
  'Virtueel kaartnummer contactloze betaling',
  'Kaarthouder',
  'Rekeningnummer',
  'Mededeling',
  'Tijdstip',
  'Met',
])

const CHANNEL_LINE = /^via\s+(.+)$/
const BIC_LINE = /^BIC:\s*(\S+)$/
const FOOTER_START = /^KBC Bank NV\b/
// Standard Belgian structured communication. Defensive only — no fixture carries one yet.
const STRUCTURED_REF = /^\+{3}\d{3}\/\d{4}\/\d{5}\+{3}$/

/**
 * How strongly this text looks like a KBC mobile export.
 * @returns {number} 0..1
 */
export function detect(text) {
  if (typeof text !== 'string' || !text) return 0
  if (text.includes(FOOTER_MARKER)) return 1
  // Fall back to the fixed header block if the footer was lost (e.g. a partial extraction).
  if (text.includes('KBC-Rekening') && text.includes('Elektronisch afschrift')) return 0.6
  return 0
}

/**
 * Parse one "Export KBC Mobile" document.
 * @param {string} text  reconstructed line text (what extractText produces)
 * @returns {import('../types.js').ParsedStatement | import('../types.js').ParseFailure}
 */
export function parse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, reason: 'The PDF produced no text — it may be a scan rather than a digital statement.' }
  }

  const lines = text.split(/\r?\n/).map(l => l.trim())
  const footerIdx = lines.findIndex(l => FOOTER_START.test(l))
  const body = footerIdx === -1 ? lines : lines.slice(0, footerIdx)

  const warnings = []

  // ── Header (adapter spec §1) ───────────────────────────────────────────────
  const accountHolder = body[0] || null
  const ibanLineIdx = body.findIndex(l => /^[A-Z]{2}\d{2}(\s\d{4})+(\s[A-Z]{3})?$/.test(l))
  const { iban: accountIban, currency } = ibanLineIdx === -1
    ? { iban: null, currency: null }
    : parseIbanLine(body[ibanLineIdx])
  if (!accountIban) warnings.push('Could not read the account number from the header.')

  // ── Transaction line (adapter spec §2) ─────────────────────────────────────
  const txnIdx = body.findIndex(l => TXN_LINE.test(l))
  if (txnIdx === -1) {
    return { ok: false, reason: 'No transaction line found — this may not be a KBC Mobile export.' }
  }
  const [, rawDate, rawCounterparty, rawAmount] = TXN_LINE.exec(body[txnIdx])

  const date = parseKbcDate(rawDate)
  const signedAmount = parseKbcAmount(rawAmount)
  if (date === null) return { ok: false, reason: `Could not read the date "${rawDate}".` }
  if (signedAmount === null) return { ok: false, reason: `Could not read the amount "${rawAmount}".` }
  if (signedAmount === 0) return { ok: false, reason: 'The statement amount is zero.' }

  // ── Detail block (adapter spec §3 / §3b / §3c) ─────────────────────────────
  // The block ends at a blank line OR at the footer. Both terminators are needed: the .txt
  // fixtures carry blank lines, but real extractText output does NOT (empty lines are
  // filtered out during line reconstruction), so in production the footer is the only
  // terminator — without it the footer would be swallowed and become the typeKeyword.
  const detailLines = []
  for (let i = txnIdx + 1; i < body.length; i++) {
    if (!body[i]) break
    if (FOOTER_START.test(body[i]) || body[i].includes(FOOTER_MARKER)) break
    detailLines.push(body[i])
  }
  const { fields, channel, bic, unlabelled } = parseDetailBlock(detailLines)

  // ── Type dispatch: by which labels are present, NOT by line count (§4a) ────
  const kind = classify(fields, detailLines)
  if (kind === 'unknown') {
    warnings.push('Unrecognised transaction type — only the date, amount and counterparty were read.')
  }

  const mededeling = fields.Mededeling ?? null
  const structuredReference = mededeling && STRUCTURED_REF.test(mededeling) ? mededeling : null

  const counterparty = rawCounterparty.trim()
  const note = buildNote({ kind, counterparty, channel, mededeling, structuredReference })

  /** @type {import('../types.js').NormalizedTransaction} */
  const transaction = {
    date,
    amount: Math.abs(signedAmount),
    direction: signedAmount < 0 ? 'debit' : 'credit',
    counterparty,
    counterpartyKey: counterpartyKey(counterparty),
    counterpartyIban: fields.Rekeningnummer ? fields.Rekeningnummer.replace(/\s+/g, '') : null,
    counterpartyBic: bic,
    note,
    typeKeyword: unlabelled.at(-1) ?? null,
    channel,
    kind,
    structuredReference,
    raw: [body[txnIdx], ...detailLines],
  }

  return {
    bank: BANK_ID,
    format: FORMAT_ID,
    accountIban,
    accountHolder,
    currency,
    transactions: [transaction],
    warnings,
  }
}

// Walks the block as alternating label/value pairs, tolerating a label whose value is
// missing (a truncated export) rather than swallowing the next label as its value.
function parseDetailBlock(detailLines) {
  const fields = {}
  const unlabelled = []
  let channel = null
  let bic = null

  for (let i = 0; i < detailLines.length; i++) {
    const line = detailLines[i]

    const channelMatch = CHANNEL_LINE.exec(line)
    if (channelMatch) { channel = channelMatch[1].trim(); continue }

    const bicMatch = BIC_LINE.exec(line)
    if (bicMatch) { bic = bicMatch[1]; continue }

    if (DETAIL_LABELS.has(line)) {
      const value = detailLines[i + 1]
      if (value !== undefined && !DETAIL_LABELS.has(value)) {
        fields[line] = value
        i++                            // consume the value line
      }
      continue
    }

    unlabelled.push(line)
  }

  return { fields, channel, bic, unlabelled }
}

function classify(fields, detailLines) {
  if ('Debetkaart' in fields || 'Kaarthouder' in fields) return 'card'
  if ('Rekeningnummer' in fields && 'Mededeling' in fields) return 'transfer'
  // No fixture for Domiciliëring — detect it so the row is tagged honestly, but read only
  // the fields every type shares. Do not guess at its sub-layout (adapter spec §4).
  if (detailLines.some(l => /domicili/i.test(l))) return 'direct-debit'
  return 'unknown'
}

function buildNote({ kind, counterparty, channel, mededeling, structuredReference }) {
  // A structured communication is a payment reference, not a human note — it is kept on
  // the transaction as `structuredReference` and left out of the note.
  const humanNote = structuredReference ? null : mededeling

  if (kind === 'transfer') return humanNote || counterparty

  if (kind === 'card') {
    // A card payment has no free-text note field: the merchant IS the note, with the
    // payment channel as supplementary context (adapter spec §3).
    return channel ? `${counterparty} · via ${channel}` : counterparty
  }

  return humanNote || counterparty
}
