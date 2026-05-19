import { useEffect, useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format, startOfDay, isBefore, isEqual } from 'date-fns'
import { generatePaymentDates } from '../lib/recurringUtils'

export default function TransactionChecklist({ walletId, onBalanceChanged }) {
  const [rules,        setRules]        = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { fetchAll() }, [walletId])

  async function fetchAll() {
    setLoading(true)
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from('recurring_rules').select('*')
        .eq('wallet_id', walletId).is('end_date', null),
      supabase.from('transactions').select('*')
        .eq('wallet_id', walletId),
    ])
    setRules(r ?? [])
    setTransactions(t ?? [])
    setLoading(false)
  }

  // Build pending items: every due date up to today with no confirmed transaction
  function buildPendingItems() {
    const today    = startOfDay(new Date())
    const pending  = []

    for (const rule of rules) {
      const dueDates = generatePaymentDates(rule, today)
      for (const date of dueDates) {
        const dateStr = format(date, 'yyyy-MM-dd')
        const existing = transactions.find(
          t => t.recurring_rule_id === rule.id && t.date === dateStr
        )
        if (!existing || !existing.is_confirmed) {
          pending.push({
            rule,
            date,
            dateStr,
            existingId: existing?.id ?? null,
          })
        }
      }
    }

    return pending.sort((a, b) => a.date - b.date)
  }

  async function handleCheck(item) {
    if (item.existingId) {
      // Update existing unconfirmed transaction
      await supabase.from('transactions')
        .update({ is_confirmed: true })
        .eq('id', item.existingId)
    } else {
      // Create and confirm in one step
      await supabase.from('transactions').insert({
        wallet_id:         walletId,
        recurring_rule_id: item.rule.id,
        amount:            item.rule.amount,
        type:              'debit',
        date:              item.dateStr,
        note:              item.rule.description,
        is_confirmed:      true,
      })
    }
    // Subtract from wallet balance
    await supabase.rpc('decrement_wallet_balance', {
      p_wallet_id: walletId,
      p_amount:    item.rule.amount,
    })
    fetchAll()
    onBalanceChanged?.()
  }

  const pending = buildPendingItems()

  if (loading) return <p className="text-xs text-gray-400">Loading...</p>

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        Pending payments
        {pending.length > 0 && (
          <span className="ml-2 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
            {pending.length}
          </span>
        )}
      </h2>

      {pending.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-green-400" />
          <p className="text-sm">All payments up to date</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map((item, i) => (
            <div key={i}
              className="flex items-center justify-between bg-white border border-orange-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <button onClick={() => handleCheck(item)}>
                  <Circle size={18} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                </button>
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.rule.description}</p>
                  <p className="text-xs text-gray-400">{format(item.date, 'd MMM yyyy')}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-orange-600">
                €{Number(item.rule.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}