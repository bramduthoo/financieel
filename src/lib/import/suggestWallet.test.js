import { describe, it, expect } from 'vitest'
import { suggestWallet } from './suggestWallet.js'

const groceries = { id: 'w-groceries', name: 'Groceries', type: 'variable', is_active: true, is_system: false }
const subs = { id: 'w-subs', name: 'Spotify & streaming', type: 'fixed', is_active: true, is_system: false }
const rent = { id: 'w-rent', name: 'Rent', type: 'fixed', is_active: true, is_system: false }
const unallocated = { id: 'w-unalloc', name: 'Unallocated', type: 'unallocated', is_active: true, is_system: true }

const WALLETS = [groceries, subs, rent, unallocated]

const tx = (over = {}) => ({
  counterpartyKey: 'delhaize group',
  counterparty: 'Delhaize Group N.V. BE9000 GENT',
  note: 'Delhaize Group N.V. BE9000 GENT · via Bancontact',
  kind: 'card',
  ...over,
})

describe('layer 1 — learned mappings', () => {
  it('suggests the wallet the user chose last time', () => {
    const mappings = [{ counterparty_key: 'delhaize group', wallet_id: 'w-groceries' }]
    expect(suggestWallet(tx(), { mappings, wallets: WALLETS }))
      .toEqual({ walletId: 'w-groceries', source: 'learned' })
  })

  it('beats the cold-start heuristic when both would fire', () => {
    // "spotify" would name-match the subscriptions wallet, but an explicit learned
    // mapping is the stronger signal and must win.
    const mappings = [{ counterparty_key: 'spotify', wallet_id: 'w-groceries' }]
    const result = suggestWallet(tx({ counterpartyKey: 'spotify', counterparty: 'SPOTIFY', note: 'SPOTIFY' }), {
      mappings, wallets: WALLETS,
    })
    expect(result).toEqual({ walletId: 'w-groceries', source: 'learned' })
  })

  it('ignores a mapping pointing at a deactivated wallet', () => {
    const mappings = [{ counterparty_key: 'delhaize group', wallet_id: 'w-old' }]
    expect(suggestWallet(tx(), { mappings, wallets: WALLETS })).toBeNull()
  })
})

describe('layer 2 — cold start', () => {
  it('matches a merchant whose name appears in a wallet name', () => {
    const t = tx({ counterpartyKey: 'spotify', counterparty: 'SPOTIFY* PREMIUM', note: 'SPOTIFY* PREMIUM' })
    expect(suggestWallet(t, { wallets: WALLETS })).toEqual({ walletId: 'w-subs', source: 'guess' })
  })

  it('returns null when nothing resembles a wallet name', () => {
    // Honest about the first import: merchant names rarely look like wallet names.
    expect(suggestWallet(tx(), { wallets: WALLETS })).toBeNull()
  })

  it('stays silent when two wallets match equally well', () => {
    const wallets = [
      { id: 'a', name: 'Spotify family', type: 'fixed', is_active: true },
      { id: 'b', name: 'Spotify solo', type: 'fixed', is_active: true },
    ]
    expect(suggestWallet(tx({ counterpartyKey: 'spotify', note: 'spotify' }), { wallets })).toBeNull()
  })

  it('does not match a wallet name as a substring of a longer word', () => {
    // "Auto" must not claim "autoshop" — a wrong pre-filled wallet can be confirmed
    // without being read, which is worse than no suggestion at all.
    const wallets = [{ id: 'a', name: 'Auto', type: 'variable', is_active: true }]
    expect(suggestWallet(tx({ counterpartyKey: 'autoshop vandenberghe', note: 'autoshop' }), { wallets })).toBeNull()
  })

  it('ignores short tokens that would collide', () => {
    const wallets = [{ id: 'a', name: 'BBQ', type: 'variable', is_active: true }]
    expect(suggestWallet(tx({ counterpartyKey: 'pieter', note: 'bbq - els' }), { wallets })).toBeNull()
  })

  it('suggests the single fixed wallet for a direct debit', () => {
    const wallets = [groceries, rent, unallocated]
    const t = tx({ counterpartyKey: 'energieleverancier', note: 'Domiciliëring', kind: 'direct-debit' })
    expect(suggestWallet(t, { wallets })).toEqual({ walletId: 'w-rent', source: 'guess' })
  })

  it('stays silent for a direct debit when several fixed wallets exist', () => {
    const t = tx({ counterpartyKey: 'energieleverancier', note: 'Domiciliëring', kind: 'direct-debit' })
    expect(suggestWallet(t, { wallets: WALLETS })).toBeNull()
  })
})

describe('safety rails', () => {
  it('never suggests the Unallocated system wallet', () => {
    // Parking an imported spend in the free pool would corrupt it. An unmatched row must
    // stay empty and force a conscious choice.
    const mappings = [{ counterparty_key: 'delhaize group', wallet_id: 'w-unalloc' }]
    const t = tx({ counterpartyKey: 'delhaize group', note: 'unallocated' })
    expect(suggestWallet(t, { mappings, wallets: WALLETS })).toBeNull()
  })

  it('never suggests an inactive wallet', () => {
    const wallets = [{ id: 'a', name: 'Spotify old', type: 'fixed', is_active: false }]
    expect(suggestWallet(tx({ counterpartyKey: 'spotify', note: 'spotify' }), { wallets })).toBeNull()
  })

  it('handles missing context without throwing', () => {
    expect(suggestWallet(tx(), {})).toBeNull()
    expect(suggestWallet(null, { wallets: WALLETS })).toBeNull()
  })
})
