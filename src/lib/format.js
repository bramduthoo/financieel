// European money formatting — single source for all euro DISPLAY (DESIGN-SPEC §5).
// Output is deterministic (hand-rolled, not Intl.NumberFormat) so behaviour tests
// stay stable across Node/ICU versions and the € always renders with a normal
// space (Intl uses a non-breaking space). Produces `€ 1.234,56`.
//
// NOT for calculation/rounding — that stays in the pure lib modules.

const MINUS = '−' // U+2212 minus sign, matches the app's prior `−€` convention

export function formatMoney(amount, { decimals = 2 } = {}) {
  const n = Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  const fixed = Math.abs(safe).toFixed(decimals)
  const showNeg = safe < 0 && Number(fixed) !== 0 // never render "−€ 0,00"
  const [intPart, decPart = ''] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') // thousands: 1.234.567
  const body = decPart ? `${grouped},${decPart}` : grouped
  return `${showNeg ? MINUS : ''}€ ${body}`
}
