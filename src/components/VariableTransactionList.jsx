import { useEffect, useState } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
      <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
        {transactions.map(t => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{t.note || '—'}</p>
              <p className="text-xs text-gray-400">{format(parseISO(t.date), 'd MMM yyyy')}</p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <span className={`text-sm font-medium ${t.type === 'debit' ? 'text-[#A32D2D]' : 'text-[#3B6D11]'}`}>
                {t.type === 'debit' ? '−' : '+'}€{Number(t.amount).toFixed(2)}
              </span>
              <button
                onClick={() => onEdit(t)}
                className="p-1.5 text-gray-300 hover:text-gray-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => setDeleteTarget(t)}
                className="p-1.5 text-gray-300 hover:text-[#A32D2D] hover:bg-[#FCEBEB] rounded-lg transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Delete transaction?</h2>
            <p className="text-gray-500 text-sm mb-6">
              Remove{' '}
              <span className="font-medium text-gray-700">
                {deleteTarget.type === 'debit' ? '−' : '+'}€{Number(deleteTarget.amount).toFixed(2)}
                {deleteTarget.note ? ` · ${deleteTarget.note}` : ''}
              </span>{' '}
              from {format(parseISO(deleteTarget.date), 'd MMM yyyy')}? The wallet balance will be corrected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50"
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
