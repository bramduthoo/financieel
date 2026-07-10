import { describe, it, expect } from 'vitest'
import { formatMoney } from './format'

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
