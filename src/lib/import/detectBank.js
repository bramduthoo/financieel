// Bank routing. The PDF identifies its own bank; the Settings `bank_provider` preference
// is only a tiebreaker, never an override (pdf-import-plan.md §2) — so a statement from a
// different bank is detected and reported, not misparsed by the preferred adapter.

import * as kbc from './banks/kbc.js'

// Registry. Adding a bank = one adapter file + fixtures + one line here.
export const ADAPTERS = [kbc]

export const SUPPORTED_BANKS = ADAPTERS.map(a => ({ id: a.BANK_ID, label: a.BANK_LABEL }))

const MIN_CONFIDENCE = 0.5

/**
 * @param {string} text
 * @param {{ preferredBank?: string|null }} [opts]
 * @returns {{ adapter: object|null, bank: string|null, confidence: number }}
 */
export function detectBank(text, { preferredBank = null } = {}) {
  const scored = ADAPTERS
    .map(adapter => ({ adapter, confidence: adapter.detect(text) }))
    .filter(s => s.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)

  if (scored.length === 0) return { adapter: null, bank: null, confidence: 0 }

  // Only break an actual tie with the preference — a clear winner always wins.
  const best = scored[0]
  const tied = scored.filter(s => s.confidence === best.confidence)
  const chosen = tied.length > 1
    ? (tied.find(s => s.adapter.BANK_ID === preferredBank) ?? best)
    : best

  return { adapter: chosen.adapter, bank: chosen.adapter.BANK_ID, confidence: chosen.confidence }
}
