import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

export default function VariableTransactionForm({ walletId, onSaved, onCancel, editTarget }) {
  const [name,    setName]    = useState('')
  const [amount,  setAmount]  = useState('')
  const [date,    setDate]    = useState(todayStr())
  const [remark,  setRemark]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (editTarget) {
      setName(editTarget.note ?? '')
      setAmount(String(editTarget.amount))
      setDate(editTarget.date)
      setRemark(editTarget.remark ?? '')
      setError(null)
    } else {
      setName('')
      setAmount('')
      setDate(todayStr())
      setRemark('')
      setError(null)
    }
  }, [editTarget])

  function handleSubmit() {
    if (!name.trim())                                              { setError('Enter a name.'); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)  { setError('Enter a valid amount.'); return }
    if (!date)                                                     { setError('Pick a date.'); return }
    setError(null)
    setConfirm(true)
  }

  async function handleConfirm() {
    setSaving(true)
    const amt = Number(amount)

    if (editTarget) {
      // Reverse old (always debit) then apply new
      await supabase.rpc('increment_wallet_balance', { p_wallet_id: walletId, p_amount: Number(editTarget.amount) })
      await supabase.rpc('decrement_wallet_balance', { p_wallet_id: walletId, p_amount: amt })
      await supabase.from('transactions').update({
        amount: amt, type: 'debit', date,
        note: name.trim(), remark: remark.trim() || null,
      }).eq('id', editTarget.id)
    } else {
      await supabase.from('transactions').insert({
        wallet_id: walletId, amount: amt, type: 'debit', date,
        note: name.trim(), remark: remark.trim() || null,
        is_confirmed: true, completed_at: new Date().toISOString(),
      })
      await supabase.rpc('decrement_wallet_balance', { p_wallet_id: walletId, p_amount: amt })
    }

    setSaving(false)
    setConfirm(false)
    onSaved()
  }

  const isEdit = !!editTarget

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          {isEdit ? 'Edit transaction' : 'New transaction'}
        </h2>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Groceries"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
            <input
              type="number" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date" value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
            <input
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {isEdit ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">
              {isEdit ? 'Save changes?' : 'Add transaction?'}
            </h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-700">{name.trim()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-base text-red-600">-€{Number(amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-700">{format(parseISO(date), 'd MMM yyyy')}</span>
              </div>
              {remark.trim() && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Note</span>
                  <span className="font-medium text-gray-700">{remark.trim()}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
