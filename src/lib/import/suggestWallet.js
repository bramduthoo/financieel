// Two-layer wallet suggestion (pdf-import-plan.md §6).
//
// Layer 1 — learned mappings: the engine that makes the feature feel automatic from the
// SECOND import onward. An exact counterparty-key hit is a strong suggestion.
// Layer 2 — cold start: deliberately CONSERVATIVE. Merchant names rarely resemble wallet
// names, so the first import is mostly manual by nature. A wrong pre-filled wallet is worse
// than none, because it can be confirmed without being read.
//
// No match ⇒ null ⇒ the row shows NO wallet, forcing a conscious choice. Never Unallocated:
// silently parking a spend there would corrupt the free pool.

const MIN_TOKEN = 4   // shorter tokens ("bbq", "ing") collide far too easily

/**
 * @param {{counterpartyKey: string, counterparty?: string, note?: string, kind?: string}} tx
 * @param {{ mappings?: Array<{counterparty_key: string, wallet_id: string}>, wallets?: Array<object> }} ctx
 * @returns {{ walletId: string, source: 'learned'|'guess' } | null}
 */
export function suggestWallet(tx, { mappings = [], wallets = [] } = {}) {
  if (!tx) return null

  // Only wallets the user can actually spend from. The system (Unallocated) wallet is
  // never suggestible.
  const candidates = wallets.filter(w => w.is_active !== false && !w.is_system)
  if (candidates.length === 0) return null

  const byId = new Map(candidates.map(w => [w.id, w]))

  // ── Layer 1: learned mapping ────────────────────────────────────────────────
  const key = tx.counterpartyKey ?? ''
  if (key) {
    const mapping = mappings.find(m => m.counterparty_key === key)
    // A mapping pointing at a deleted or deactivated wallet is stale — fall through to
    // cold start rather than suggesting a wallet that is no longer selectable.
    if (mapping && byId.has(mapping.wallet_id)) {
      return { walletId: mapping.wallet_id, source: 'learned' }
    }
  }

  // ── Layer 2: cold start ─────────────────────────────────────────────────────
  const haystack = [key, tx.counterparty, tx.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (haystack) {
    const named = candidates.filter(w => nameMatches(w.name, haystack))
    // Only suggest on an UNAMBIGUOUS name match — two matching wallets means we don't know.
    if (named.length === 1) return { walletId: named[0].id, source: 'guess' }
  }

  // A direct debit is nearly always a fixed cost (adapter spec / plan §6). That is only
  // actionable when it points at exactly one wallet; otherwise stay silent.
  if (tx.kind === 'direct-debit') {
    const fixed = candidates.filter(w => w.type === 'fixed')
    if (fixed.length === 1) return { walletId: fixed[0].id, source: 'guess' }
  }

  return null
}

function nameMatches(walletName, haystack) {
  const tokens = String(walletName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= MIN_TOKEN)

  // Whole-word match, not substring: a wallet named "Auto" must not claim "autoshop".
  const words = new Set(haystack.split(/[^a-z0-9]+/).filter(Boolean))
  return tokens.some(token => words.has(token))
}
