import { describe, it, expect, afterEach } from 'vitest'
import { formatMoney, formatMoneyCompact, setPrivacy } from './format'

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

describe('formatMoneyCompact', () => {
  it('abbreviates thousands with k, rounds below', () => {
    expect(formatMoneyCompact(500)).toBe('€500')
    expect(formatMoneyCompact(1500)).toBe('€1.5k')
    expect(formatMoneyCompact(2000)).toBe('€2k')
    expect(formatMoneyCompact(0)).toBe('€0')
  })
  it('prefixes negatives with a U+2212 minus', () => {
    expect(formatMoneyCompact(-1200)).toBe(`${MINUS}€1.2k`)
    expect(formatMoneyCompact(-300)).toBe(`${MINUS}€300`)
  })
})

describe('privacy mode (mask amounts)', () => {
  // Reset the module flag so masking can't leak into other suites.
  afterEach(() => setPrivacy(false))

  it('masks a full amount with the euro symbol via explicit override', () => {
    expect(formatMoney(1234.56, { privacy: true })).toBe('€ ••••')
    expect(formatMoney(-999, { privacy: true })).toBe('€ ••••') // no sign leaks
    expect(formatMoney(0, { privacy: true })).toBe('€ ••••')
  })

  it('masks via the module flag (no override) for every call', () => {
    setPrivacy(true)
    expect(formatMoney(5)).toBe('€ ••••')
    expect(formatMoney(1000000)).toBe('€ ••••')
  })

  it('an explicit privacy:false override beats the module flag', () => {
    setPrivacy(true)
    expect(formatMoney(5, { privacy: false })).toBe('€ 5,00')
  })

  it('masks compact chart-axis output too', () => {
    expect(formatMoneyCompact(1500, { privacy: true })).toBe('€••')
    setPrivacy(true)
    expect(formatMoneyCompact(1500)).toBe('€••')
  })

  it('leaves output unchanged when privacy is off', () => {
    setPrivacy(false)
    expect(formatMoney(1234.56)).toBe('€ 1.234,56')
    expect(formatMoneyCompact(1500)).toBe('€1.5k')
  })
})
