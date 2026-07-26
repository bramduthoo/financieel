// Shared, bank-agnostic normalizers for the statement-import pipeline.
//
// Deliberately NOT shared across adapters where the format differs: date parsing is
// per-adapter by design (kbc-adapter-spec.md §2 — the mobile export uses DD-MM-YYYY with
// hyphens, while the classic uittreksel uses dd/mm/yyyy). `parseKbcDate` is named for its
// format, not for "the" date format, so a future adapter can't accidentally inherit it.

// Legal-form tokens stripped from a counterparty before it becomes a mapping key, so
// "Delhaize Group N.V." and a future "Delhaize Group" collapse to the same learned key.
const LEGAL_FORMS = new Set([
  'nv', 'n.v.', 'bv', 'b.v.', 'bvba', 'b.v.b.a.', 'cv', 'cvba', 'comm.v', 'vzw',
  'sa', 's.a.', 'srl', 'sprl', 'sarl', 'gmbh', 'ltd', 'ltd.', 'inc', 'inc.', 'plc',
])

// "<CC><4-6 digits> <TOWN>" trailing locality, e.g. "BE9000 GENT", "SE11857 STOCKHOLM",
// "US94104 SAN FRANCISCO". Both Belgian and foreign localities are stripped (adapter
// spec §3c) — the town is noise for a mapping key and differs per branch of the same chain.
const TRAILING_LOCALITY = /\s+[A-Z]{2}\d{4,6}\s+[A-Z][A-Z\s'.-]*$/

/**
 * "1.234,56" / "-18,75" / "100,00" → Number. European format: dot groups thousands,
 * comma is the decimal separator. Returns null when the string isn't a valid amount,
 * so a layout drift surfaces as a parse failure instead of a silent 0.
 * @returns {number|null}
 */
export function parseKbcAmount(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  // Accepts both grouped ("1.234,56") and ungrouped ("1234,56") thousands — the fixtures are
  // all under 1000 so KBC's grouping behaviour is unconfirmed, and accepting both is safe.
  // A dot-decimal ("18.75") is still rejected: in this format that would mean something else
  // entirely, so refusing is the only safe answer.
  if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(s)) return null
  const negative = s.startsWith('-')
  const digits = s.replace(/^[+-]/, '').replace(/\./g, '').replace(',', '.')
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/**
 * "15-06-2026" (DD-MM-YYYY) → "2026-06-15". Returns the ISO date STRING, not a Date:
 * the DB column is `date` and the rest of the app compares 'yyyy-MM-dd' strings, so
 * staying in strings avoids UTC-midnight drift between local and the CI runner.
 * @returns {string|null}
 */
export function parseKbcDate(raw) {
  if (typeof raw !== 'string') return null
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const day = Number(dd)
  const month = Number(mm)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // Reject impossible days (31 Feb) by round-tripping through Date in UTC.
  const probe = new Date(Date.UTC(Number(yyyy), month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return `${yyyy}-${mm}-${dd}`
}

/**
 * "BE71 0961 2345 6789 EUR" → { iban: 'BE71096123456789', currency: 'EUR' }.
 * The header IBAN is the OWN account, never the counterparty (adapter spec §1).
 * @returns {{ iban: string|null, currency: string|null }}
 */
export function parseIbanLine(raw) {
  if (typeof raw !== 'string') return { iban: null, currency: null }
  const tokens = raw.trim().split(/\s+/)
  const currency = /^[A-Z]{3}$/.test(tokens.at(-1) ?? '') ? tokens.pop() : null
  const iban = tokens.join('')
  return { iban: /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) ? iban : null, currency }
}

/**
 * Counterparty display string → the stable key used for learned wallet mappings
 * (pdf-import-plan.md §6). Collapses branch/locality/legal-form variants of the same
 * merchant onto one key so the mapping learned on one purchase applies to the next:
 *
 *   "Delhaize Group N.V. BE9000 GENT"              → "delhaize group"
 *   "SPOTIFY* PREMIUM SE11857 STOCKHOLM"           → "spotify"
 *   "ANTHROPIC* CLAUDE SUB US94104 SAN FRANCISCO"  → "anthropic"
 *   "VERMEULEN TOM"                                → "vermeulen tom"
 *
 * Peer transfers ("pieter") produce weak keys on purpose — the cold-start heuristic is
 * expected to whiff on them, and the learned layer picks them up from the second import.
 * @returns {string}
 */
export function counterpartyKey(raw) {
  if (typeof raw !== 'string') return ''
  let s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return ''

  s = s.replace(TRAILING_LOCALITY, '')

  // A "*"-suffixed program tag ("SPOTIFY* PREMIUM") names the product, not the merchant.
  // Keep the segment before it, but never let that produce an empty key.
  const star = s.indexOf('*')
  if (star > 0) {
    const head = s.slice(0, star).trim()
    if (head) s = head
  }

  const kept = s
    .split(' ')
    .filter(token => token && !LEGAL_FORMS.has(token.toLowerCase()))

  return kept
    .join(' ')
    .toLowerCase()
    .replace(/[.,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
