// Money formatting — single source for all money DISPLAY (DESIGN-SPEC §5).
// Output is deterministic (hand-rolled, not Intl.NumberFormat) so behaviour tests
// stay stable across Node/ICU versions and the symbol always renders with a normal
// space (Intl uses a non-breaking space). Produces e.g. `€ 1.234,56` or `1.234,56 kr`.
//
// DISPLAY ONLY — the currency setting changes the symbol shown, it never converts
// amounts. Number grouping stays European (`1.234,56`) for every currency in v1;
// only the symbol and its position vary. NOT for calculation/rounding — that stays
// in the pure lib modules.

const MINUS = '−' // U+2212 minus sign, matches the app's prior `−€` convention

// Supported display currencies. `position` is where the symbol sits relative to the
// number: 'before' → `€ 1.234,56`, 'after' → `1.234,56 kr`. No amount conversion.
export const CURRENCIES = {
  EUR: { code: 'EUR', symbol: '€',   position: 'before' },
  USD: { code: 'USD', symbol: '$',   position: 'before' },
  GBP: { code: 'GBP', symbol: '£',   position: 'before' },
  CHF: { code: 'CHF', symbol: 'CHF', position: 'before' },
  CAD: { code: 'CAD', symbol: 'CA$', position: 'before' },
  AUD: { code: 'AUD', symbol: 'A$',  position: 'before' },
  SEK: { code: 'SEK', symbol: 'kr',  position: 'after'  },
  NOK: { code: 'NOK', symbol: 'kr',  position: 'after'  },
  PLN: { code: 'PLN', symbol: 'zł',  position: 'after'  },
}

// Module-level "active currency" that formatMoney reads by default. The
// CurrencyProvider keeps this in sync with settings.currency so the ~130 plain
// `formatMoney(x)` call sites need no change; a currency switch re-renders the tree
// (no React.memo anywhere) and every call re-runs against the updated symbol.
let _active = CURRENCIES.EUR

export function setActiveCurrency(code) {
  _active = CURRENCIES[code] ?? CURRENCIES.EUR
}

// The active currency's symbol — for static adornments (input `(€)` labels, the
// euro/percent mode toggles) that show the symbol but don't format an amount.
// Reads the singleton at call time, so it re-evaluates on the render triggered by
// a currency switch.
export function activeCurrencySymbol() {
  return _active.symbol
}

// Compact money for chart axis ticks: `€500`, `€1,2k`, `500 kr`, `−$1,2k`. Uses the
// active currency symbol/position; abbreviates thousands with `k`. Display only —
// centralises the per-chart formatters that previously hard-coded `€`.
export function formatMoneyCompact(value) {
  const n = Number(value)
  const safe = Number.isFinite(n) ? n : 0
  const sign = safe < 0 ? MINUS : ''
  const abs = Math.abs(safe)
  const body = abs >= 1000
    ? `${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`
    : `${Math.round(abs)}`
  // Keep the historical no-space look for a leading symbol (`€500`); a trailing
  // symbol reads better with a space (`500 kr`).
  return _active.position === 'after'
    ? `${sign}${body} ${_active.symbol}`
    : `${sign}${_active.symbol}${body}`
}

export function formatMoney(amount, { decimals = 2, currency } = {}) {
  const cur = currency ? (CURRENCIES[currency] ?? CURRENCIES.EUR) : _active
  const n = Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  const fixed = Math.abs(safe).toFixed(decimals)
  const showNeg = safe < 0 && Number(fixed) !== 0 // never render "−€ 0,00"
  const [intPart, decPart = ''] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') // thousands: 1.234.567
  const body = decPart ? `${grouped},${decPart}` : grouped
  const sign = showNeg ? MINUS : ''
  return cur.position === 'after'
    ? `${sign}${body} ${cur.symbol}`
    : `${sign}${cur.symbol} ${body}`
}
