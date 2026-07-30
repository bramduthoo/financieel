import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, detect, FORMAT_ID } from './banks/kbcCsv.js'
import { fingerprintOf } from './dedupe.js'
import { counterpartyKey } from './normalize.js'

// The anonymized real export (kbc-csv-import-background.md §2). A real statement is NEVER
// committed. Read as a raw string so the CR-only line endings reach the parser untouched —
// that is exactly what `file.text()` hands it in the browser.
const CSV = readFileSync(
  new URL('../../../test-fixtures/kbc-csv/monthly-export-01.csv', import.meta.url),
  'utf8',
)

const HEADER = CSV.split('\r')[0]
const COLUMNS = HEADER.split(';').map(h => h.trim())

// Builds a one-row export from column overrides, for cases the real fixture cannot cover
// (it carries no structured communication, and every row has both a date and a balance).
function csvWith(overrides, { header = HEADER } = {}) {
  const cells = COLUMNS.map(name => String(overrides[name] ?? ''))
  return `${header}\r${cells.join(';')}\r`
}

const statement = () => parse(CSV)
// The month contains repeat merchants (two Delhaize runs, several NMBS tickets), so this picks
// the NEWEST match — transactions come back oldest-first.
const byCounterparty = name =>
  statement().transactions.filter(t => t.counterparty.includes(name)).at(-1)

describe('detect', () => {
  it('recognises the export by its header columns', () => {
    expect(detect(CSV)).toBe(1)
  })

  it('does not claim an unrelated CSV or empty input', () => {
    expect(detect('date,amount,description\r\n2026-01-01,5,coffee')).toBe(0)
    expect(detect('')).toBe(0)
  })
})

describe('statement level', () => {
  it('reads all 42 rows with the account, holder and currency', () => {
    const s = statement()
    expect(s.transactions).toHaveLength(42)
    expect(s.accountIban).toBe('BE71096123456789')
    expect(s.accountHolder).toBe('JANSSENS ELS')
    expect(s.currency).toBe('EUR')
    expect(s.format).toBe(FORMAT_ID)
    expect(s.singleAccount).toBe(true)
  })

  it('derives the opening and closing balance from the Saldo endpoints', () => {
    const s = statement()
    expect(s.openingBalance).toBe(476.63)
    expect(s.closingBalance).toBe(606.22)
  })

  it('parses the real export without warnings', () => {
    expect(statement().warnings).toEqual([])
  })
})

describe('ledger order', () => {
  it('returns rows oldest-first by reversing the file, not by sorting on Datum', () => {
    const s = statement()
    expect(s.transactions[0].date).toBe('2025-12-01')
    expect(s.transactions[0].sourceIndex).toBe(41)
    expect(s.transactions.at(-1).date).toBe('2025-12-31')
    expect(s.transactions.at(-1).sourceIndex).toBe(0)
    expect(s.transactions.map(t => t.ledgerIndex)).toEqual(s.transactions.map((_, i) => i))
  })

  it('is NOT the same as a Datum sort — sorting by date would break the Saldo chain', () => {
    // The real export inverts on Datum (21/12 listed after 22/12). This asserts the two
    // orders genuinely differ, so a future "just sort by date" refactor fails here loudly.
    const ledger = statement().transactions
    const dateSorted = [...ledger].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    expect(dateSorted.map(t => t.sourceIndex)).not.toEqual(ledger.map(t => t.sourceIndex))
  })

  it('keeps every row on an unbroken Saldo chain in that order', () => {
    const ledger = statement().transactions
    for (const [i, tx] of ledger.entries()) {
      const before = i === 0 ? statement().openingBalance : ledger[i - 1].saldoAfter
      expect(Math.round((before + tx.signedAmount) * 100) / 100).toBe(tx.saldoAfter)
    }
  })
})

describe('card payment', () => {
  it('reads amount, date, direction and the merchant out of the description', () => {
    const tx = byCounterparty('DELHAIZE')
    expect(tx.date).toBe('2025-12-31')
    expect(tx.amount).toBe(50.62)
    expect(tx.direction).toBe('debit')
    expect(tx.counterparty).toBe('DELHAIZE WATERSPORT NV BE9000 GENT')
    expect(tx.counterpartyKey).toBe('delhaize watersport')
    expect(tx.kind).toBe('card')
    expect(tx.channel).toBe('Bancontact')
    expect(tx.typeKeyword).toBe('BETALING VIA BANCONTACT')
    expect(tx.note).toBe('DELHAIZE WATERSPORT NV BE9000 GENT · via Bancontact')
    expect(tx.counterpartyIban).toBeNull()
  })

  it('strips the trailing card block, the cardholder and the merchant info block', () => {
    // "... AMZN MKTP BE LU1855 LUXEMBOURG MET KBC-DEBETKAART … KAARTHOUDER: … INFO VAN DE
    // HANDELAAR: 75HL93I WWW.AMAZON.COM.BE"
    expect(byCounterparty('AMZN').counterparty).toBe('AMZN MKTP BE LU1855 LUXEMBOURG')
    expect(byCounterparty('XANTYP').counterparty).toBe('BV XANTYP BE9000 GENT')
  })

  it('reads the virtual-card channel from the type', () => {
    const tx = byCounterparty('ST. PIERRE')
    expect(tx.channel).toBe('Debit Mastercard')
    expect(tx.note).toContain('· via Debit Mastercard')
  })
})

describe('transfers', () => {
  it('reads an incoming transfer from the counterparty columns, with its free note', () => {
    const credit = statement().transactions.find(t => t.amount === 2714.95)
    expect(credit.direction).toBe('credit')
    expect(credit.date).toBe('2025-12-22')
    expect(credit.counterparty).toBe('UNIVERSITEIT GENT')
    expect(credit.counterpartyIban).toBe('BE66345678901234')
    expect(credit.counterpartyBic).toBe('BBRUBEBB')
    expect(credit.kind).toBe('transfer')
    expect(credit.note).toBe('/FOR/-/A/ 20051664/202512')
  })

  it('reads an outgoing transfer, keeping the amount positive and the direction explicit', () => {
    const tx = statement().transactions.find(t => t.note === 'ticket nieuwjaar')
    expect(tx.direction).toBe('debit')
    expect(tx.amount).toBe(29.3)
    expect(tx.date).toBe('2025-12-18')
    expect(tx.counterparty).toBe('LUCAS')
    expect(tx.counterpartyIban).toBe('BE99678901234567')
    expect(tx.typeKeyword).toBe('INSTANTOVERSCHRIJVING NAAR')
  })

  it('reads the self-transfer that stands in for a recurring salary transfer', () => {
    const tx = statement().transactions.find(t => t.note === 'spaargeld maandloon 1')
    expect(tx.date).toBe('2025-12-27')
    expect(tx.amount).toBe(2000)
    expect(tx.direction).toBe('debit')
    expect(tx.counterparty).toBe('JANSSENS ELS')
    expect(tx.counterpartyKey).toBe('janssens els')
    expect(tx.kind).toBe('transfer')
  })

  it('prefers "Naam tegenpartij" over anything parsed out of the description', () => {
    // This row's description names "BREW MONKEY" while the counterparty column says
    // "Coffee Corner" — the column wins (background §2, two-path rule).
    const tx = statement().transactions.find(t => t.counterpartyIban === 'BE21890123456789')
    expect(tx.counterparty).toBe('Coffee Corner')
    expect(tx.raw[0]).toContain('BREW MONKEY')
  })
})

describe('mededelingen', () => {
  it('maps Vrije mededeling to the note', () => {
    expect(statement().transactions.some(t => t.note === 'Avondeten')).toBe(true)
    expect(statement().transactions.some(t => t.note === 'STEAKS GELD')).toBe(true)
  })

  it('keeps a structured communication out of the note', () => {
    const s = parse(csvWith({
      Rekeningnummer: 'BE71096123456789',
      Datum: '05/12/2025',
      Omschrijving: 'DOMICILIERING           05-12 ENERGIE NV',
      Bedrag: '-88,20',
      Saldo: '100,00',
      debet: '-88,20',
      'Naam tegenpartij': 'ENERGIE NV',
      'gestructureerde mededeling': '+++123/4567/89012+++',
    }))
    const tx = s.transactions[0]
    expect(tx.structuredReference).toBe('+++123/4567/89012+++')
    expect(tx.note).toBe('ENERGIE NV')
    expect(tx.kind).toBe('direct-debit')
    expect(tx.raw[0]).toContain('+++123/4567/89012+++')
  })

  it('treats a structured reference typed into the free field as a reference too', () => {
    const s = parse(csvWith({
      Rekeningnummer: 'BE71096123456789',
      Datum: '05/12/2025',
      Omschrijving: 'OVERSCHRIJVING NAAR     05-12 SOMEONE',
      Bedrag: '-10,00',
      Saldo: '100,00',
      debet: '-10,00',
      'Naam tegenpartij': 'SOMEONE',
      'Vrije mededeling': '+++123/4567/89012+++',
    }))
    expect(s.transactions[0].note).toBe('SOMEONE')
    expect(s.transactions[0].structuredReference).toBe('+++123/4567/89012+++')
  })
})

describe('direction', () => {
  it('uses the credit/debet columns rather than the sign', () => {
    const s = statement()
    expect(s.transactions.filter(t => t.direction === 'credit')).toHaveLength(5)
    expect(s.transactions.filter(t => t.direction === 'debit')).toHaveLength(37)
  })

  it('falls back to the Bedrag sign when both columns are blank', () => {
    const base = {
      Rekeningnummer: 'BE71096123456789',
      Datum: '05/12/2025',
      Omschrijving: 'OVERSCHRIJVING VAN      05-12 SOMEONE',
      Saldo: '100,00',
      'Naam tegenpartij': 'SOMEONE',
    }
    expect(parse(csvWith({ ...base, Bedrag: '-10,00' })).transactions[0].direction).toBe('debit')
    expect(parse(csvWith({ ...base, Bedrag: '10,00' })).transactions[0].direction).toBe('credit')
  })

  it('warns when a column and the sign disagree', () => {
    const s = parse(csvWith({
      Rekeningnummer: 'BE71096123456789',
      Datum: '05/12/2025',
      Omschrijving: 'OVERSCHRIJVING VAN      05-12 SOMEONE',
      Bedrag: '10,00',
      Saldo: '100,00',
      debet: '10,00',
      'Naam tegenpartij': 'SOMEONE',
    }))
    expect(s.transactions[0].direction).toBe('debit')
    expect(s.warnings.join(' ')).toContain('debet column but the amount is positive')
  })
})

describe('refusals', () => {
  it('refuses a file whose required column is missing, naming it', () => {
    const withoutSaldo = CSV.split('\r')
      .map(line => {
        const cells = line.split(';')
        const at = COLUMNS.indexOf('Saldo')
        return cells.filter((_, i) => i !== at).join(';')
      })
      .join('\r')
    const result = parse(withoutSaldo)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('"saldo"')
  })

  it('refuses rather than skipping a row with an unreadable date, amount or balance', () => {
    const base = {
      Rekeningnummer: 'BE71096123456789',
      Datum: '05/12/2025',
      Omschrijving: 'OVERSCHRIJVING VAN      05-12 SOMEONE',
      Bedrag: '-10,00',
      Saldo: '100,00',
      debet: '-10,00',
    }
    expect(parse(csvWith({ ...base, Datum: '05-12-2025' })).reason).toContain('date')
    expect(parse(csvWith({ ...base, Bedrag: '-10.00' })).reason).toContain('amount')
    expect(parse(csvWith({ ...base, Saldo: '' })).reason).toContain('balance')
  })

  it('refuses an empty file and a header-only file', () => {
    expect(parse('').ok).toBe(false)
    expect(parse(`${HEADER}\r`).reason).toContain('no transactions')
  })

  it('flags an export that mixes two accounts instead of computing one balance for both', () => {
    const two = `${HEADER}\r`
      + `BE71096123456789;;JANSSENS ELS;EUR;1;31/12/2025;OVERSCHRIJVING VAN 31-12 A;31/12/2025;10,00;110,00;10,00;;;;A;;;\r`
      + `BE00000000000000;;JANSSENS ELS;EUR;1;30/12/2025;OVERSCHRIJVING VAN 30-12 B;30/12/2025;10,00;100,00;10,00;;;;B;;;\r`
    const s = parse(two)
    expect(s.singleAccount).toBe(false)
    expect(s.warnings.join(' ')).toContain('more than one account')
  })
})

describe('cross-source consistency', () => {
  it('produces the same fingerprint as the PDF adapter would for the same transaction', () => {
    // The PDF prints "Delhaize Watersport N.V. BE9000 GENT"; the CSV prints it uppercase with
    // "NV". Both must collapse to one dedupe key, or a month imported by CSV would re-import
    // transactions already imported one-by-one from PDFs.
    const csvRow = byCounterparty('DELHAIZE')
    const asPdfWouldPrint = {
      accountIban: csvRow.accountIban,
      date: '2025-12-31',
      amount: 50.62,
      direction: 'debit',
      counterpartyKey: counterpartyKey('Delhaize Watersport N.V. BE9000 GENT'),
    }
    expect(fingerprintOf(asPdfWouldPrint)).toBe(fingerprintOf(csvRow))
  })
})
