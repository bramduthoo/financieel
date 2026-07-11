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

  if (loading) return <p className="text-sm text-ink-faint py-4">Loading…</p>

  if (transactions.length === 0) {
    return (
      <div className="text-center py-10 text-ink-faint">
        <p className="text-sm">No transactions this month</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-card rounded-[14px] border border-card-border divide-y divide-inner-border">
        {transactions.map(t => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{t.note || '—'}</p>
              <p className="text-xs text-ink-faint">{format(parseISO(t.date), 'd MMM yyyy')}</p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <span className={`text-sm font-medium ${t.type === 'debit' ? 'text-negative' : 'text-positive'}`}>
                {t.type === 'debit' ? '−' : '+'}{formatMoney(Number(t.amount))}
              </span>
              <button
                onClick={() => onEdit(t)}
                className="p-1.5 text-ink-faint dark:text-ink-soft hover:text-ink hover:bg-accent/10 rounded-lg transition-colors"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => setDeleteTarget(t)}
                className="p-1.5 text-ink-faint hover:text-negative hover:bg-negative-tint rounded-lg transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-ink mb-2">Delete transaction?</h2>
            <p className="text-ink-muted text-sm mb-6">
              Remove{' '}
              <span className="font-medium text-ink">
                {deleteTarget.type === 'debit' ? '-' : '+'}{formatMoney(Number(deleteTarget.amount))}
                {deleteTarget.note ? ` · ${deleteTarget.note}` : ''}
              </span>{' '}
              from {format(parseISO(deleteTarget.date), 'd MMM yyyy')}? The wallet balance will be corrected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-negative-bar text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
