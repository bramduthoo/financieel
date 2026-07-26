import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, detect } from './banks/kbc.js'

// Fixtures are anonymized real statements (kbc-adapter-spec.md §5b). Real statements are
// NEVER committed. They are stored as extracted-text .txt, which is exactly what
// extractText produces, so the adapter is tested on its true input shape.
function fixture(name) {
  return readFileSync(
    new URL(`../../../test-fixtures/kbc-mobile-export/${name}.txt`, import.meta.url),
    'utf8',
  )
}

const card = () => parse(fixture('card-payment-01'))
const virtualCard = () => parse(fixture('card-payment-virtual-01'))
const transferIn = () => parse(fixture('transfer-in-01'))
const transferOut = () => parse(fixture('transfer-out-01'))

const only = statement => statement.transactions[0]

const ALL_FIXTURES = ['card-payment-01', 'card-payment-virtual-01', 'transfer-in-01', 'transfer-out-01']

describe('detect', () => {
  it('recognises every fixture via the footer marker', () => {
    for (const name of ALL_FIXTURES) {
      expect(detect(fixture(name))).toBe(1)
    }
  })

  it('does not claim an unrelated document', () => {
    expect(detect('Belfius rekeninguittreksel 2026')).toBe(0)
    expect(detect('')).toBe(0)
  })
})

describe('header parsing', () => {
  it('reads the OWN account IBAN, holder and currency', () => {
    const s = card()
    expect(s.accountIban).toBe('BE71096123456789')
    expect(s.accountHolder).toBe('JANSSENS ELS')
    expect(s.currency).toBe('EUR')
  })

  it('never mistakes the counterparty IBAN for the account IBAN', () => {
    // transfer-in has BOTH: the header account and the counterparty's Rekeningnummer.
    const s = transferIn()
    expect(s.accountIban).toBe('BE71096123456789')
    expect(only(s).counterpartyIban).toBe('BE68539007547034')
  })

  it('produces exactly one transaction per file', () => {
    // One PDF = one transaction is the defining property of this format.
    for (const s of [card(), virtualCard(), transferIn(), transferOut()]) {
      expect(s.transactions).toHaveLength(1)
      expect(s.warnings).toEqual([])
    }
  })
})

describe('card payment — physical (§3)', () => {
  it('reads the transaction as a debit', () => {
    const t = only(card())
    expect(t.date).toBe('2026-06-15')
    expect(t.amount).toBe(18.75)
    expect(t.direction).toBe('debit')
    expect(t.counterparty).toBe('Delhaize Group N.V. BE9000 GENT')
    expect(t.counterpartyKey).toBe('delhaize group')
  })

  it('classifies it by the detail-block labels', () => {
    const t = only(card())
    expect(t.kind).toBe('card')
    expect(t.channel).toBe('Bancontact')
    expect(t.typeKeyword).toBe('Betaling met KBC-Debetkaart')
  })

  it('composes the note from merchant + channel (a card has no free-text note)', () => {
    expect(only(card()).note).toBe('Delhaize Group N.V. BE9000 GENT · via Bancontact')
  })

  it('amount is always positive — direction carries the sign', () => {
    expect(only(card()).amount).toBeGreaterThan(0)
  })
})

describe('card payment — virtual (§3c)', () => {
  it('reads it despite the extra label/value pair in the detail block', () => {
    // The virtual card adds "Virtueel kaartnummer contactloze betaling" between
    // Debetkaart and Kaarthouder. This is why the block is parsed as label/value pairs
    // and not by fixed line offsets — a fixed-offset parser reads the wrong lines here.
    const t = only(virtualCard())
    expect(t.date).toBe('2026-06-10')
    expect(t.amount).toBe(11.99)
    expect(t.direction).toBe('debit')
    expect(t.kind).toBe('card')
  })

  it('reads the Mastercard channel and type keyword', () => {
    const t = only(virtualCard())
    expect(t.channel).toBe('Debit Mastercard')
    expect(t.typeKeyword).toBe('Betaling met M4M - MDES for merchants')
  })

  it('collapses the merchant to a stable key despite the tag and foreign locality', () => {
    expect(only(virtualCard()).counterpartyKey).toBe('spotify')
  })
})

describe('transfer in (§3b) — the credit case', () => {
  it('reads an unsigned amount as a CREDIT', () => {
    // The only signal for direction is the absent minus sign. There is no direction word.
    const t = only(transferIn())
    expect(t.direction).toBe('credit')
    expect(t.amount).toBe(100)
    expect(t.date).toBe('2026-06-15')
  })

  it('uses the Mededeling as the note', () => {
    const t = only(transferIn())
    expect(t.note).toBe('Zonnepaneel')
    expect(t.counterparty).toBe('VERMEULEN TOM')
  })

  it('captures the counterparty account and BIC', () => {
    const t = only(transferIn())
    expect(t.counterpartyIban).toBe('BE68539007547034')
    expect(t.counterpartyBic).toBe('KREDBEBBXXX')
    expect(t.kind).toBe('transfer')
    expect(t.typeKeyword).toBe('Instantoverschrijving')
  })
})

describe('transfer out (§3b) — with the optional Met block', () => {
  it('reads it as a debit and is not thrown off by the extra Met label', () => {
    const t = only(transferOut())
    expect(t.direction).toBe('debit')
    expect(t.amount).toBe(13)
    expect(t.counterparty).toBe('pieter')
    expect(t.note).toBe('bbq - els')
    expect(t.typeKeyword).toBe('Instantoverschrijving')
  })

  it('still resolves the counterparty account', () => {
    expect(only(transferOut()).counterpartyIban).toBe('BE45063586923389')
  })
})

describe('production-shaped input (what extractText actually produces)', () => {
  // extractText drops empty lines during line reconstruction, so the blank lines in the
  // .txt fixtures do NOT exist at runtime. These assert the adapter never depends on them.
  const stripBlanks = text => text.split(/\r?\n/).filter(l => l.trim()).join('\n')

  it('parses every fixture identically with no blank lines', () => {
    for (const name of ALL_FIXTURES) {
      const withBlanks = only(parse(fixture(name)))
      const without = only(parse(stripBlanks(fixture(name))))
      expect(without).toEqual(withBlanks)
    }
  })

  it('does not swallow the footer into the detail block', () => {
    // Without a footer terminator the last footer line becomes the typeKeyword.
    const t = only(parse(stripBlanks(fixture('card-payment-01'))))
    expect(t.typeKeyword).toBe('Betaling met KBC-Debetkaart')
    expect(t.raw.join(' ')).not.toContain('Export KBC Mobile')
  })

  it('still reads the transaction when the superscript currency lands on its own line', () => {
    // The currency renders superscript, so line reconstruction can bucket it separately.
    // Requiring it would fail the whole file with a misleading "not a KBC export".
    const text = fixture('card-payment-01').replace(
      '15-06-2026 Delhaize Group N.V. BE9000 GENT -18,75 EUR',
      '15-06-2026 Delhaize Group N.V. BE9000 GENT -18,75\nEUR',
    )
    const t = only(parse(text))
    expect(t.amount).toBe(18.75)
    expect(t.direction).toBe('debit')
    expect(t.counterparty).toBe('Delhaize Group N.V. BE9000 GENT')
  })
})

describe('type dispatch is by label, not by line count', () => {
  it('separates cards from transfers across all four fixtures', () => {
    expect([card(), virtualCard()].map(s => only(s).kind)).toEqual(['card', 'card'])
    expect([transferIn(), transferOut()].map(s => only(s).kind)).toEqual(['transfer', 'transfer'])
  })
})

describe('unfixtured and malformed input', () => {
  const header = [
    'JANSSENS ELS',
    'KBC-Rekening',
    'BE71 0961 2345 6789 EUR',
    'Elektronisch afschrift',
    '',
  ]
  const footer = ['', 'KBC Bank NV - Havenlaan 2 - 1080 Brussel', '2026-06-15-A031-BE71 Export KBC Mobile 1/1']
  const doc = detail => [...header, ...detail, ...footer].join('\n')

  it('tags a Domiciliëring generically without inventing its sub-layout', () => {
    // No fixture exists for this type (adapter spec §4). Only the fields EVERY type shares
    // are read; nothing is guessed about the block's internal structure.
    const s = parse(doc([
      '15-06-2026 ENERGIELEVERANCIER N.V. BE1000 BRUSSEL -84,20 EUR',
      'Domiciliëring',
    ]))
    const t = only(s)
    expect(t.kind).toBe('direct-debit')
    expect(t.amount).toBe(84.2)
    expect(t.direction).toBe('debit')
    expect(t.date).toBe('2026-06-15')
    expect(t.counterpartyKey).toBe('energieleverancier')
  })

  it('keeps a structured communication out of the note but on the transaction', () => {
    const s = parse(doc([
      '15-06-2026 SOME BILLER 50,00 EUR',
      'Rekeningnummer',
      'BE68 5390 0754 7034',
      'Mededeling',
      '+++123/4567/89012+++',
      'Instantoverschrijving',
    ]))
    const t = only(s)
    expect(t.structuredReference).toBe('+++123/4567/89012+++')
    expect(t.note).toBe('SOME BILLER')   // a payment reference is not a human note
  })

  it('warns rather than guesses when no known label is present', () => {
    const s = parse(doc(['15-06-2026 MYSTERY PAYEE -5,00 EUR', 'Iets onbekends']))
    expect(only(s).kind).toBe('unknown')
    expect(s.warnings.join(' ')).toMatch(/Unrecognised transaction type/)
  })

  it('fails cleanly on a document with no transaction line', () => {
    const s = parse([...header, ...footer].join('\n'))
    expect(s.ok).toBe(false)
    expect(s.reason).toMatch(/No transaction line/)
  })

  it('fails cleanly on empty text (a scanned PDF has no text layer)', () => {
    const s = parse('')
    expect(s.ok).toBe(false)
    expect(s.reason).toMatch(/no text/)
  })
})
