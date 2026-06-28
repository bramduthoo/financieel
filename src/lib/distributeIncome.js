import { supabase } from './supabase'

export async function distributeIncome({ distributions, wallets, unallocatedWalletId, sourceName, date, isAutomated = false, userId, incomeEntryId = null }) {
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
        date, note: `Income distribution — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId,
      })
      continue
    }

    // Automated (recurring) — apply cap and reduction logic for capped wallets
    if (wallet.budget_type === 'capped') {
      const balance = Number(wallet.balance)
      const cap     = Number(wallet.budget)

      if (balance < cap) {
        // Cap not yet reached: fill up to cap, route any overflow to Unallocated
        const creditToWallet = Math.min(amount, cap - balance)
        const excess         = Number((amount - creditToWallet).toFixed(2))

        await supabase.rpc('increment_wallet_balance', { p_wallet_id: wallet.id, p_amount: creditToWallet })
        transactionRows.push({
          wallet_id: wallet.id, type: 'credit', amount: creditToWallet,
          date, note: `Income distribution — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId,
        })

        if (excess > 0 && unallocatedWalletId) {
          await supabase.rpc('increment_wallet_balance', { p_wallet_id: unallocatedWalletId, p_amount: excess })
          transactionRows.push({
            wallet_id: unallocatedWalletId, type: 'credit', amount: excess,
            date, note: `Cap overflow (${wallet.name}) — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId,
          })
        }
      } else if (wallet.cap_reduction_enabled) {
        // Cap reached + reduction enabled: apply the rate
        const rate          = Number(wallet.cap_reduction_rate)
        const reducedAmount = Number((amount * rate).toFixed(2))
        const excess        = Number((amount - reducedAmount).toFixed(2))

        if (reducedAmount > 0) {
          await supabase.rpc('increment_wallet_balance', { p_wallet_id: wallet.id, p_amount: reducedAmount })
          transactionRows.push({
            wallet_id: wallet.id, type: 'credit', amount: reducedAmount,
            date, note: `Income distribution (reduced) — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId,
          })
        }
        if (excess > 0 && unallocatedWalletId) {
          await supabase.rpc('increment_wallet_balance', { p_wallet_id: unallocatedWalletId, p_amount: excess })
          transactionRows.push({
            wallet_id: unallocatedWalletId, type: 'credit', amount: excess,
            date, note: `Cap reduction overflow (${wallet.name}) — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId,
          })
        }
      } else {
        // Cap reached + reduction disabled: route full amount to Unallocated
        if (unallocatedWalletId) {
          await supabase.rpc('increment_wallet_balance', { p_wallet_id: unallocatedWalletId, p_amount: amount })
          transactionRows.push({
            wallet_id: unallocatedWalletId, type: 'credit', amount,
            date, note: `Cap overflow (${wallet.name}) — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId,
          })
        }
      }
    } else {
      // Non-capped automated wallet: credit full amount
      await supabase.rpc('increment_wallet_balance', { p_wallet_id: dist.wallet_id, p_amount: amount })
      transactionRows.push({
        wallet_id: dist.wallet_id, type: 'credit', amount,
        date, note: `Income distribution — ${sourceName}`, is_confirmed: true, user_id: userId, income_entry_id: incomeEntryId,
      })
    }
  }

  if (transactionRows.length > 0) {
    await supabase.from('transactions').insert(transactionRows)
  }
}
