import { describe, it, expect, afterEach } from 'vitest'
import { formatMoney, formatMoneyCompact, setActiveCurrency, setPrivacy } from './format'

const MINUS = '−' // U+2212, the sign formatMoney emits for negatives

describe('formatMoney', () => {
  it('formats with European grouping and comma decimals', () => {
    expect(formatMoney(1234.56)).toBe('€ 1.234,56')
    expect(formatMoney(1000000)).toBe('€ 1.000.000,00')
    expect(formatMoney(5)).toBe('€ 5,00')
    expect(formatMoney(999)).toBe('€ 999,00')
  })

  it('always shows two decimals by default', () => {
    expect(formatMoney(1234.5)).toBe('€ 1.234,50')
    expect(formatMoney(1234)).toBe('€ 1.234,00')
  })

  it('renders negatives with a U+2212 minus before the €', () => {
    expect(formatMoney(-1234.56)).toBe(`${MINUS}€ 1.234,56`)
    expect(formatMoney(-5)).toBe(`${MINUS}€ 5,00`)
  })

  it('treats zero and negative zero as plain zero (never "−€ 0,00")', () => {
    expect(formatMoney(0)).toBe('€ 0,00')
    expect(formatMoney(-0)).toBe('€ 0,00')
    expect(formatMoney(-0.004)).toBe('€ 0,00') // rounds to zero → no minus
  })

  it('rounds to the requested precision', () => {
    expect(formatMoney(999.999)).toBe('€ 1.000,00')
    expect(formatMoney(1.005)).toBe('€ 1,00') // standard IEEE toFixed behaviour
    expect(formatMoney(2.675)).toBe('€ 2,67')
  })

  it('honours the decimals option (0-decimal euro sites)', () => {
    expect(formatMoney(1234.567, { decimals: 0 })).toBe('€ 1.235')
    expect(formatMoney(-1234, { decimals: 0 })).toBe(`${MINUS}€ 1.234`)
    expect(formatMoney(0, { decimals: 0 })).toBe('€ 0')
  })

  it('coerces string input (DB numerics arrive as strings)', () => {
    expect(formatMoney('1234.5')).toBe('€ 1.234,50')
    expect(formatMoney('-1234.56')).toBe(`${MINUS}€ 1.234,56`)
  })

  it('falls back to zero for non-finite / missing input', () => {
    expect(formatMoney(NaN)).toBe('€ 0,00')
    expect(formatMoney(undefined)).toBe('€ 0,00')
    expect(formatMoney(null)).toBe('€ 0,00')
    expect(formatMoney(Infinity)).toBe('€ 0,00')
  })
})

describe('formatMoney — currency (display only, European grouping everywhere)', () => {
  // Reset the module singleton so the ambient-currency tests below can't leak.
  afterEach(() => setActiveCurrency('EUR'))

  it('places a "before" symbol ahead of the number with a normal space', () => {
    expect(formatMoney(1234.56, { currency: 'USD' })).toBe('$ 1.234,56')
    expect(formatMoney(1234.56, { currency: 'GBP' })).toBe('£ 1.234,56')
    expect(formatMoney(1234.56, { currency: 'CHF' })).toBe('CHF 1.234,56')
    expect(formatMoney(1234.56, { currency: 'CAD' })).toBe('CA$ 1.234,56')
  })

  it('places an "after" symbol behind the number with a normal space', () => {
    expect(formatMoney(1234.56, { currency: 'SEK' })).toBe('1.234,56 kr')
    expect(formatMoney(1234.56, { currency: 'PLN' })).toBe('1.234,56 zł')
  })

  it('keeps the minus sign leftmost for both positions', () => {
    expect(formatMoney(-1234.56, { currency: 'USD' })).toBe(`${MINUS}$ 1.234,56`)
    expect(formatMoney(-1234.56, { currency: 'SEK' })).toBe(`${MINUS}1.234,56 kr`)
  })

  it('falls back to EUR for an unknown currency code', () => {
    expect(formatMoney(1234.56, { currency: 'XYZ' })).toBe('€ 1.234,56')
  })

  it('reads the module active currency when no override is passed', () => {
    setActiveCurrency('USD')
    expect(formatMoney(5)).toBe('$ 5,00')
    expect(formatMoney(-1234.56)).toBe(`${MINUS}$ 1.234,56`)
    setActiveCurrency('SEK')
    expect(formatMoney(5)).toBe('5,00 kr')
  })

  it('an explicit override wins over the module active currency', () => {
    setActiveCurrency('USD')
    expect(formatMoney(5, { currency: 'GBP' })).toBe('£ 5,00')
  })

  it('unknown active currency code falls back to EUR', () => {
    setActiveCurrency('NOPE')
    expect(formatMoney(5)).toBe('€ 5,00')
  })
})

describe('formatMoney — privacy mode (mask amounts)', () => {
  // Reset both singletons so masking can't leak into other suites.
  afterEach(() => { setPrivacy(false); setActiveCurrency('EUR') })

  it('masks the amount with the symbol via explicit override', () => {
    expect(formatMoney(1234.56, { privacy: true })).toBe('€ ••••')
    expect(formatMoney(-999, { privacy: true })).toBe('€ ••••') // no sign leaks
    expect(formatMoney(0, { privacy: true })).toBe('€ ••••')
  })

  it('honours the after-symbol position when masked', () => {
    expect(formatMoney(1234.56, { currency: 'SEK', privacy: true })).toBe('•••• kr')
    expect(formatMoney(1234.56, { currency: 'USD', privacy: true })).toBe('$ ••••')
  })

  it('masks via the module flag (no override) for every call', () => {
    setPrivacy(true)
    expect(formatMoney(5)).toBe('€ ••••')
    setActiveCurrency('SEK')
    expect(formatMoney(5)).toBe('•••• kr')
  })

  it('an explicit privacy:false override beats the module flag', () => {
    setPrivacy(true)
    expect(formatMoney(5, { privacy: false })).toBe('€ 5,00')
  })

  it('masks compact chart-axis output too', () => {
    expect(formatMoneyCompact(1500, { privacy: true })).toBe('€••')
    setPrivacy(true)
    expect(formatMoneyCompact(1500)).toBe('€••')
    setActiveCurrency('SEK')
    expect(formatMoneyCompact(1500)).toBe('•• kr')
  })

  it('leaves output unchanged when privacy is off', () => {
    setPrivacy(false)
    expect(formatMoney(1234.56)).toBe('€ 1.234,56')
    expect(formatMoneyCompact(1500)).toBe('€1.5k') // compact uses toFixed → period, unchanged from before
  })
})
