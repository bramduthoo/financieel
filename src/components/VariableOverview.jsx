import { useState, useEffect } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import VariableTransactionForm from './VariableTransactionForm'
import { formatMoney } from '../lib/format'

export default function VariableOverview({ walletId, onBalanceChanged }) {
  const [showForm,     setShowForm]     = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [timeframe,    setTimeframe]    = useState('month')
  const [detail,       setDetail]       = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)
  const [refreshKey,   setRefreshKey]   = useState(0)

  useEffect(() => { fetchTransactions() }, [walletId, timeframe, refreshKey])

  async function fetchTransactions() {
    setLoading(true)
    const today = new Date()
    const from  = format(
      timeframe === 'week' ? startOfWeek(today, { weekStartsOn: 1 }) : startOfMonth(today),
      'yyyy-MM-dd'
    )
    const to    = format(
      timeframe === 'week' ? endOfWeek(today, { weekStartsOn: 1 }) : endOfMonth(today),
      'yyyy-MM-dd'
    )
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

  function handleFormSaved() {
    setShowForm(false)
    setEditTarget(null)
    setRefreshKey(k => k + 1)
    onBalanceChanged()
  }

  function handleCancel() {
    setShowForm(false)
    setEditTarget(null)
  }

  function handleEdit(t) {
    setDetail(null)
    setEditTarget(t)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.rpc('increment_wallet_balance', {
      p_wallet_id: walletId, p_amount: Number(deleteTarget.amount),
    })
    await supabase.from('transactions').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    setDeleting(false)
    setDetail(null)
    setRefreshKey(k => k + 1)
    onBalanceChanged()
  }

  const showingForm = showForm || !!editTarget
  const total = transactions.reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div className="space-y-4">
      {/* Add transaction button or inline form */}
      {!showingForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-ink text-cream px-4 py-2 rounded-lg text-sm font-medium hover:bg-track transition-colors"
        >
          <Plus size={15} /> Add transaction
        </button>
      ) : (
        <VariableTransactionForm
          walletId={walletId}
          onSaved={handleFormSaved}
          onCancel={handleCancel}
          editTarget={editTarget}
        />
      )}

      {/* Transaction overview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">Transactions</h2>
          <div className="flex gap-1 bg-track rounded-lg p-1">
            {[['week', 'This week'], ['month', 'This month']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTimeframe(id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeframe === id
                    ? 'bg-card shadow-sm text-ink'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10 text-ink-faint border border-dashed border-card-border rounded-[14px]">
            <p className="text-sm">No transactions {timeframe === 'week' ? 'this week' : 'this month'}</p>
          </div>
        ) : (
          <div className="bg-card rounded-[14px] border border-card-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-track text-xs text-ink-muted uppercase tracking-wide border-b border-card-border">
                <tr>
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {transactions.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => setDetail(t)}
                    className="hover:bg-track cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">{t.note ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-muted whitespace-nowrap">
                      {format(parseISO(t.date), 'd MMM yyyy')}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-negative">
                      {formatMoney(-Number(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-track border-t border-card-border text-xs">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-ink-muted">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-negative">
                    {formatMoney(-total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail modal ──────────────────────────────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-ink">Transaction detail</h2>
              <button onClick={() => setDetail(null)} className="p-1.5 text-ink-faint hover:text-ink-soft rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Name</span>
                <span className="font-medium text-ink">{detail.note ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Amount</span>
                <span className="font-medium text-negative">{formatMoney(-Number(detail.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Date</span>
                <span className="text-ink">{format(parseISO(detail.date), 'd MMM yyyy')}</span>
              </div>
              {detail.remark && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Note</span>
                  <span className="text-ink text-right max-w-[60%]">{detail.remark}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { setDeleteTarget(detail); setDetail(null) }}
                className="px-3 py-2 rounded-lg border border-negative-bar/25 text-sm text-negative hover:bg-negative-tint transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setDetail(null)}
                className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track"
              >
                Close
              </button>
              <button
                onClick={() => handleEdit(detail)}
                className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:bg-track"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ───────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-ink mb-2">Delete transaction?</h2>
            <p className="text-ink-muted text-sm mb-6">
              Remove{' '}
              <span className="font-medium text-ink">
                {deleteTarget.note ?? '—'} · {formatMoney(-Number(deleteTarget.amount))}
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
    </div>
  )
}
