// European money formatting — single source for all euro DISPLAY (DESIGN-SPEC §5).
// Output is deterministic (hand-rolled, not Intl.NumberFormat) so behaviour tests
// stay stable across Node/ICU versions and the € always renders with a normal
// space (Intl uses a non-breaking space). Produces `€ 1.234,56`.
//
// NOT for calculation/rounding — that stays in the pure lib modules.

const MINUS = '−' // U+2212 minus sign, matches the app's prior `−€` convention
const MASK = '••••'        // privacy-mode replacement for a full amount (`€ ••••`)
const MASK_COMPACT = '••'  // shorter mask for chart axis ticks (`€••`)

// Privacy mode ("hide amounts"). Session-only: a PrivacyProvider flips this and
// re-renders the tree (no React.memo), so every formatMoney/formatMoneyCompact call
// re-runs and masks live — no call-site changes. When on, amounts render as the
// euro symbol + a fixed mask (no sign, no digits, digit-count not revealed).
let _privacy = false

export function setPrivacy(on) {
  _privacy = !!on
}

export function formatMoney(amount, { decimals = 2, privacy } = {}) {
  if (privacy ?? _privacy) return `€ ${MASK}`
  const n = Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  const fixed = Math.abs(safe).toFixed(decimals)
  const showNeg = safe < 0 && Number(fixed) !== 0 // never render "−€ 0,00"
  const [intPart, decPart = ''] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') // thousands: 1.234.567
  const body = decPart ? `${grouped},${decPart}` : grouped
  return `${showNeg ? MINUS : ''}€ ${body}`
}

// Compact euro for chart axis ticks: `€500`, `€1.5k`, `−€1.2k`. Abbreviates
// thousands with `k`. Display only — centralises the per-chart formatters that
// previously hard-coded the same logic, and masks (`€••`) under privacy mode.
export function formatMoneyCompact(value, { privacy } = {}) {
  if (privacy ?? _privacy) return `€${MASK_COMPACT}`
  const n = Number(value)
  const safe = Number.isFinite(n) ? n : 0
  const sign = safe < 0 ? MINUS : ''
  const abs = Math.abs(safe)
  const body = abs >= 1000
    ? `${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`
    : `${Math.round(abs)}`
  return `${sign}€${body}`
}
