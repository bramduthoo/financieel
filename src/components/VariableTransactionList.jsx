import { useEffect, useState } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'

export default function VariableTransactionList({ walletId, viewMonth, refreshKey, onChanged, onEdit }) {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  useEffect(() => { fetchTransactions() }, [walletId, viewMonth, refreshKey])

  async function fetchTransactions() {
    setLoading(true)
    const from = format(startOfMonth(viewMonth), 'yyyy-MM-dd')
    const to   = format(endOfMonth(viewMonth),   'yyyy-MM-dd')
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .gte('date', from)
      .lte('date', to)
      .order('date',       { ascending: false })
      .order('created_at', { ascending: false })
    setTransactions(data ?? [])
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    if (deleteTarget.type === 'debit') {
      await supabase.rpc('increment_wallet_balance', {
        p_wallet_id: walletId, p_amount: Number(deleteTarget.amount),
      })
    } else {
      await supabase.rpc('decrement_wallet_balance', {
        p_wallet_id: walletId, p_amount: Number(deleteTarget.amount),
      })
    }
    await supabase.from('transactions').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    setDeleting(false)
    fetchTransactions()
    onChanged?.()
  }

  if (loading) return <p className="text-sm text-gray-400 py-4">Loading…</p>

  if (transactions.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-sm">No transactions this month</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {transactions.map(t => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{t.note || '—'}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{format(parseISO(t.date), 'd MMM yyyy')}</p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <span className={`text-sm font-medium ${t.type === 'debit' ? 'text-[#A32D2D]' : 'text-[#3B6D11]'}`}>
                {t.type === 'debit' ? '−' : '+'}{formatMoney(Number(t.amount))}
              </span>
              <button
                onClick={() => onEdit(t)}
                className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => setDeleteTarget(t)}
                className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Delete transaction?</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Remove{' '}
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {deleteTarget.type === 'debit' ? '-' : '+'}{formatMoney(Number(deleteTarget.amount))}
                {deleteTarget.note ? ` · ${deleteTarget.note}` : ''}
              </span>{' '}
              from {format(parseISO(deleteTarget.date), 'd MMM yyyy')}? The wallet balance will be corrected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-[#A32D2D] text-white text-sm font-medium hover:bg-[#8a2626] disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
