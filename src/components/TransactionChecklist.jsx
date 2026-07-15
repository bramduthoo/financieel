import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { format, startOfDay } from 'date-fns'
import { generatePaymentDates } from '../lib/recurringUtils'
import { formatMoney } from '../lib/format'

export default function TransactionChecklist({ walletId, onBalanceChanged }) {
  const [rules,        setRules]        = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [confirmItem,  setConfirmItem]  = useState(null)
  const [remark,       setRemark]       = useState('')
  const [saving,       setSaving]       = useState(false)

  useEffect(() => { fetchAll() }, [walletId])

  async function fetchAll() {
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from('recurring_rules').select('*')
        .eq('wallet_id', walletId).is('end_date', null),
      supabase.from('transactions').select('*').eq('wallet_id', walletId),
    ])
    setRules(r ?? [])
    setTransactions(t ?? [])
    setLoading(false)
  }

  function buildPendingItems() {
    const today   = startOfDay(new Date())
    const pending = []
    for (const rule of rules) {
      const dueDates = generatePaymentDates(rule, today)
      for (const date of dueDates) {
        const dateStr  = format(date, 'yyyy-MM-dd')
        const existing = transactions.find(
          t => t.recurring_rule_id === rule.id && t.date === dateStr
        )
        if (!existing || !existing.is_confirmed) {
          pending.push({ rule, date, dateStr, existingId: existing?.id ?? null })
        }
      }
    }
    return pending.sort((a, b) => a.date - b.date)
  }

  async function handleConfirm() {
    if (!confirmItem) return
    setSaving(true)
    const now = new Date().toISOString()

    if (confirmItem.existingId) {
      await supabase.from('transactions')
        .update({ is_confirmed: true, remark: remark || null, completed_at: now })
        .eq('id', confirmItem.existingId)
    } else {
      const userId = await getCurrentUserId()
      await supabase.from('transactions').insert({
        wallet_id:         walletId,
        recurring_rule_id: confirmItem.rule.id,
        amount:            confirmItem.rule.amount,
        type:              'debit',
        date:              confirmItem.dateStr,
        note:              confirmItem.rule.name,
        remark:            remark || null,
        is_confirmed:      true,
        completed_at:      now,
        user_id:           userId,
      })
    }

    await supabase.rpc('decrement_wallet_balance', {
      p_wallet_id: walletId,
      p_amount:    confirmItem.rule.amount,
    })

    setConfirmItem(null)
    setRemark('')
    setSaving(false)
    fetchAll()
    onBalanceChanged?.()
  }

  const pending = buildPendingItems()

  if (loading) return <p className="text-xs text-ink-faint">Loading...</p>

  return (
    <div>
      <h2 className="text-sm font-medium text-ink mb-3">
        Pending payments
        {pending.length > 0 && (
          <span className="ml-2 bg-negative-tint text-negative text-[11px] font-medium px-2 py-0.5 rounded-full">
            {pending.length}
          </span>
        )}
      </h2>

      {pending.length === 0 ? (
        <div className="text-center py-5 text-ink-faint">
          <CheckCircle2 size={26} className="mx-auto mb-1.5 text-positive" />
          <p className="text-sm">All payments up to date</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {pending.map((item, i) => (
            <div key={i}
              className="flex items-center justify-between bg-card border border-warning/30 rounded-lg px-4 py-2">
              <div className="flex items-center gap-3">
                <button onClick={() => { setConfirmItem(item); setRemark('') }}>
                  <Circle size={18} className="text-ink-faint dark:text-ink-soft hover:text-accent transition-colors" />
                </button>
                <div>
                  <p className="text-sm font-medium text-ink">{item.rule.name}</p>
                  {item.rule.description && (
                    <p className="text-xs text-ink-faint">{item.rule.description}</p>
                  )}
                  <p className="text-xs text-ink-faint">Due {format(item.date, 'd MMM yyyy')}</p>
                </div>
              </div>
              <span className="text-sm font-medium text-negative">
                {formatMoney(Number(item.rule.amount))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation modal */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-medium text-ink">Confirm payment</h2>
              <button onClick={() => setConfirmItem(null)}>
                <X size={18} className="text-ink-faint" />
              </button>
            </div>

            <div className="bg-track rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-ink">{confirmItem.rule.name}</p>
              {confirmItem.rule.description && (
                <p className="text-xs text-ink-muted mt-0.5">{confirmItem.rule.description}</p>
              )}
              <p className="text-xs text-ink-muted mt-1">
                Due {format(confirmItem.date, 'd MMM yyyy')}
              </p>
              <p className="text-xl font-medium text-ink mt-2">
                {formatMoney(Number(confirmItem.rule.amount))}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Remark <span className="text-ink-faint">(optional)</span>
              </label>
              <input
                value={remark}
                onChange={e => setRemark(e.target.value)}
                placeholder="e.g. Paid via bank transfer"
                className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setConfirmItem(null)}
                className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {saving ? 'Confirming...' : 'Confirm paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}