import { describe, it, expect } from 'vitest'
import { parseKbcAmount, parseKbcDate, parseIbanLine, counterpartyKey } from './normalize.js'

describe('parseKbcAmount', () => {
  it('reads a plain debit amount', () => {
    expect(parseKbcAmount('-18,75')).toBe(-18.75)
  })

  it('reads a credit amount that carries NO sign', () => {
    // The whole direction rule hangs on this: KBC prints incoming money without a minus.
    expect(parseKbcAmount('100,00')).toBe(100)
  })

  it('reads an explicit plus sign as positive', () => {
    expect(parseKbcAmount('+42,50')).toBe(42.5)
  })

  it('reads a thousands-grouped amount', () => {
    expect(parseKbcAmount('1.234,56')).toBe(1234.56)
    expect(parseKbcAmount('-1.234,56')).toBe(-1234.56)
  })

  it('also reads an UNgrouped four-figure amount', () => {
    // Every fixture is under €1000, so KBC's grouping behaviour above that is unconfirmed.
    // Accepting both spellings avoids failing a real statement on an untested assumption.
    expect(parseKbcAmount('1234,56')).toBe(1234.56)
    expect(parseKbcAmount('-1234,56')).toBe(-1234.56)
  })

  it('rejects a malformed group', () => {
    expect(parseKbcAmount('1.23,45')).toBeNull()
  })

  it('rejects a dot-decimal amount rather than silently misreading it', () => {
    // "18.75" in this format means eighteen-thousand-something, not 18.75 — refusing is
    // the only safe answer, and a refusal surfaces as a parse failure in the UI.
    expect(parseKbcAmount('18.75')).toBeNull()
  })

  it('rejects junk', () => {
    expect(parseKbcAmount('EUR')).toBeNull()
    expect(parseKbcAmount('')).toBeNull()
    expect(parseKbcAmount(null)).toBeNull()
  })
})

describe('parseKbcDate', () => {
  it('converts DD-MM-YYYY to an ISO date string', () => {
    expect(parseKbcDate('15-06-2026')).toBe('2026-06-15')
  })

  it('does not confuse day and month', () => {
    expect(parseKbcDate('06-11-2026')).toBe('2026-11-06')
  })

  it('rejects the slashed format used by the classic uittreksel', () => {
    // Each adapter parses its own confirmed format; sharing a date regex across formats
    // is exactly the bug this guards against (pdf-import-plan.md §4).
    expect(parseKbcDate('15/06/2026')).toBeNull()
  })

  it('rejects impossible dates', () => {
    expect(parseKbcDate('31-02-2026')).toBeNull()
    expect(parseKbcDate('00-06-2026')).toBeNull()
    expect(parseKbcDate('15-13-2026')).toBeNull()
  })
})

describe('parseIbanLine', () => {
  it('joins the spaced groups and splits off the currency', () => {
    expect(parseIbanLine('BE71 0961 2345 6789 EUR')).toEqual({
      iban: 'BE71096123456789',
      currency: 'EUR',
    })
  })

  it('handles a line with no trailing currency', () => {
    expect(parseIbanLine('BE68 5390 0754 7034')).toEqual({
      iban: 'BE68539007547034',
      currency: null,
    })
  })
})

describe('counterpartyKey', () => {
  it('strips a Belgian locality suffix and the legal form', () => {
    expect(counterpartyKey('Delhaize Group N.V. BE9000 GENT')).toBe('delhaize group')
  })

  it('collapses two branches of the same chain onto one key', () => {
    // The entire point of the learned-mapping layer: the wallet chosen in Gent must apply
    // to the same merchant in Kortrijk.
    expect(counterpartyKey('Delhaize Group N.V. BE9000 GENT'))
      .toBe(counterpartyKey('Delhaize Group BE8500 KORTRIJK'))
  })

  it('strips a foreign locality and a *-suffixed program tag', () => {
    expect(counterpartyKey('SPOTIFY* PREMIUM SE11857 STOCKHOLM')).toBe('spotify')
    expect(counterpartyKey('ANTHROPIC* CLAUDE SUB US94104 SAN FRANCISCO')).toBe('anthropic')
  })

  it('leaves a person name alone apart from casing', () => {
    expect(counterpartyKey('VERMEULEN TOM')).toBe('vermeulen tom')
    expect(counterpartyKey('pieter')).toBe('pieter')
  })

  it('never returns an empty key for a name that is only a program tag', () => {
    expect(counterpartyKey('*PREMIUM')).toBe('*premium')
  })

  it('handles empty and non-string input', () => {
    expect(counterpartyKey('')).toBe('')
    expect(counterpartyKey(null)).toBe('')
  })
})
