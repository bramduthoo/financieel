import { supabase } from './supabase'
import { resolveCappedInflow } from './resolveCappedInflow'

// `importFingerprint` (optional) stamps the dedupe key from a statement import onto the
// credit rows this creates, so a re-imported statement is recognised as a duplicate. Null
// for every hand-entered income — the existing callers are unaffected.
export async function distributeIncome({ distributions, wallets, unallocatedWalletId, sourceName, date, isAutomated = false, userId, incomeEntryId = null, importFingerprint = null }) {
  const transactionRows = []

  for (const dist of distributions) {
    const amount = Number(dist.amount)
    if (!amount || amount <= 0) continue

    const wallet = wallets.find(w => w.id === dist.wallet_id)
    if (!wallet) continue

    if (!isAutomated) {
      // Manual or template: always credit the full specified amount, no cap enforcement
      await supabase.rpc('increment_wallet_balance', { p_wallet_id: dist.wallet_id, p_amount: amount })
      transactionRows.push({
        wallet_id: dist.wallet_id, type: 'credit', amount,
        date, note: `Income distribution — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId, import_fingerprint: importFingerprint,
      })
      continue
    }

    // Automated (recurring) — capped wallets always apply the fill-to-max / reduce-remainder
    // mechanic (§4.2). Fill up to cap_max at 100%, reduce the part above the ceiling to the
    // wallet's rate, and route the overflow to the configured wallet (else Unallocated).
    if (wallet.budget_type === 'capped') {
      const { received, overflow } = resolveCappedInflow({
        balance: wallet.balance, amount, max: wallet.cap_max, rate: wallet.cap_reduction_rate,
      })
      const overflowTargetId = wallet.overflow_wallet_id || unallocatedWalletId

      if (received > 0) {
        await supabase.rpc('increment_wallet_balance', { p_wallet_id: wallet.id, p_amount: received })
        transactionRows.push({
          wallet_id: wallet.id, type: 'credit', amount: received,
          date, note: `Income distribution — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId, import_fingerprint: importFingerprint,
        })
      }

      if (overflow > 0 && overflowTargetId) {
        await supabase.rpc('increment_wallet_balance', { p_wallet_id: overflowTargetId, p_amount: overflow })
        transactionRows.push({
          wallet_id: overflowTargetId, type: 'credit', amount: overflow,
          date, note: `Cap overflow (${wallet.name}) — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId, import_fingerprint: importFingerprint,
        })
      }
    } else {
      // Non-capped automated wallet: credit full amount
      await supabase.rpc('increment_wallet_balance', { p_wallet_id: dist.wallet_id, p_amount: amount })
      transactionRows.push({
        wallet_id: dist.wallet_id, type: 'credit', amount,
        date, note: `Income distribution — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId, import_fingerprint: importFingerprint,
      })
    }
  }

  if (transactionRows.length > 0) {
    await supabase.from('transactions').insert(transactionRows)
  }
}
