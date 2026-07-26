import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { detectBank, SUPPORTED_BANKS } from './detectBank.js'

const kbcText = readFileSync(
  new URL('../../../test-fixtures/kbc-mobile-export/card-payment-01.txt', import.meta.url),
  'utf8',
)

describe('detectBank', () => {
  it('routes a KBC mobile export to the KBC adapter', () => {
    const { bank, confidence, adapter } = detectBank(kbcText)
    expect(bank).toBe('kbc')
    expect(confidence).toBe(1)
    expect(typeof adapter.parse).toBe('function')
  })

  it('returns no adapter for an unrecognised document', () => {
    // A statement from a bank with no adapter must be REPORTED, never fed to the
    // preferred adapter and misparsed (pdf-import-plan.md §2).
    expect(detectBank('Some unrelated PDF text')).toEqual({ adapter: null, bank: null, confidence: 0 })
  })

  it('does not let the Settings preference override a confident detection', () => {
    const { bank } = detectBank(kbcText, { preferredBank: 'belfius' })
    expect(bank).toBe('kbc')
  })

  it('lists the supported banks for the Settings selector', () => {
    expect(SUPPORTED_BANKS).toEqual([{ id: 'kbc', label: 'KBC' }])
  })
})
