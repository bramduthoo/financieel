import { useState, useEffect } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import VariableTransactionForm from './VariableTransactionForm'

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
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
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
          <h2 className="text-sm font-medium text-gray-900">Transactions</h2>
          <div className="flex gap-1 bg-stone-100 rounded-lg p-1">
            {[['week', 'This week'], ['month', 'This month']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTimeframe(id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeframe === id
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10 text-gray-400 border border-dashed border-stone-200 rounded-xl">
            <p className="text-sm">No transactions {timeframe === 'week' ? 'this week' : 'this month'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs text-gray-500 uppercase tracking-wide border-b border-stone-200">
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
                    className="hover:bg-stone-50 cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">{t.note ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {format(parseISO(t.date), 'd MMM yyyy')}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-[#A32D2D]">
                      −€{Number(t.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-stone-50 border-t border-stone-200 text-xs">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-gray-500">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-[#A32D2D]">
                    −€{total.toFixed(2)}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Transaction detail</h2>
              <button onClick={() => setDetail(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-900">{detail.note ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-[#A32D2D]">−€{Number(detail.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-700">{format(parseISO(detail.date), 'd MMM yyyy')}</span>
              </div>
              {detail.remark && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Note</span>
                  <span className="text-gray-700 text-right max-w-[60%]">{detail.remark}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { setDeleteTarget(detail); setDetail(null) }}
                className="px-3 py-2 rounded-lg border border-[#F7C1C1] text-sm text-[#A32D2D] hover:bg-[#FCEBEB] transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setDetail(null)}
                className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50"
              >
                Close
              </button>
              <button
                onClick={() => handleEdit(detail)}
                className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Delete transaction?</h2>
            <p className="text-gray-500 text-sm mb-6">
              Remove{' '}
              <span className="font-medium text-gray-700">
                {deleteTarget.note ?? '—'} · −€{Number(deleteTarget.amount).toFixed(2)}
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
    </div>
  )
}
