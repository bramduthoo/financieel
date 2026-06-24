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
<<<<<<< HEAD
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <h2 className="text-sm font-medium text-gray-900 mb-4">
=======
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
>>>>>>> WOUTER
          {isEdit ? 'Edit transaction' : 'New transaction'}
        </h2>
        {error && <p className="text-[#A32D2D] text-sm mb-3">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Groceries"
<<<<<<< HEAD
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
=======
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
>>>>>>> WOUTER
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Amount (€)</label>
            <input
              type="number" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
<<<<<<< HEAD
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
=======
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
>>>>>>> WOUTER
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date</label>
            <input
              type="date" value={date}
              onChange={e => setDate(e.target.value)}
<<<<<<< HEAD
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
=======
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
>>>>>>> WOUTER
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Note (optional)</label>
            <input
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="Optional"
<<<<<<< HEAD
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
=======
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
>>>>>>> WOUTER
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
<<<<<<< HEAD
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50"
=======
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
>>>>>>> WOUTER
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            {isEdit ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </div>

      {confirm && (
<<<<<<< HEAD
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              {isEdit ? 'Save changes?' : 'Add transaction?'}
            </h2>
            <div className="bg-stone-50 rounded-lg p-4 mb-5 space-y-2">
=======
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
              {isEdit ? 'Save changes?' : 'Add transaction?'}
            </h2>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-5 space-y-2">
>>>>>>> WOUTER
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Name</span>
                <span className="font-medium text-gray-700 dark:text-gray-200">{name.trim()}</span>
              </div>
              <div className="flex justify-between text-sm">
<<<<<<< HEAD
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-base text-[#A32D2D]">−€{Number(amount).toFixed(2)}</span>
=======
                <span className="text-gray-500 dark:text-gray-400">Amount</span>
                <span className="font-bold text-base text-red-600">-€{Number(amount).toFixed(2)}</span>
>>>>>>> WOUTER
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Date</span>
                <span className="font-medium text-gray-700 dark:text-gray-200">{format(parseISO(date), 'd MMM yyyy')}</span>
              </div>
              {remark.trim() && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Note</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{remark.trim()}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
<<<<<<< HEAD
                className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50"
=======
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
>>>>>>> WOUTER
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
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
