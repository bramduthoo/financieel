import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { ChevronUp, ChevronDown, X } from 'lucide-react'

export default function PaymentHistory({ walletId }) {
  const [history,   setHistory]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('all')
  const [sort,      setSort]      = useState({ key: 'due', dir: 'desc' })
  const [pageSize,  setPageSize]  = useState(10)

  const [detail,   setDetail]   = useState(null)  // transaction being viewed
  const [editForm, setEditForm] = useState(null)  // null | form fields
  const [confirm,  setConfirm]  = useState(null)  // null | { onConfirm }
  const [saving,   setSaving]   = useState(false)

  useEffect(() => { fetchHistory() }, [walletId])

  async function fetchHistory() {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, recurring_rules(name, description)')
      .eq('wallet_id', walletId)
      .eq('is_confirmed', true)
      .order('date', { ascending: false })
    setHistory(data ?? [])
    setLoading(false)
  }

  const ruleNames = [...new Set(
    history.map(t => t.recurring_rules?.name).filter(Boolean)
  )]

  const filtered = history.filter(t =>
    filter === 'all' || t.recurring_rules?.name === filter
  )

  const sorted = [...filtered].sort((a, b) => {
    let av, bv
    if (sort.key === 'due')       { av = a.date;                bv = b.date                }
    if (sort.key === 'completed') { av = a.completed_at ?? '';  bv = b.completed_at ?? ''  }
    if (sort.key === 'amount')    { av = Number(a.amount);      bv = Number(b.amount)      }
    if (sort.key === 'name')      { av = a.recurring_rules?.name ?? ''; bv = b.recurring_rules?.name ?? '' }
    if (av < bv) return sort.dir === 'asc' ? -1 : 1
    if (av > bv) return sort.dir === 'asc' ?  1 : -1
    return 0
  })

  const visible = pageSize === 'all' ? sorted : sorted.slice(0, Number(pageSize))

  function toggleSort(key) {
    setSort(s =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    )
  }

  function SortIcon({ col }) {
    if (sort.key !== col) return <ChevronUp size={12} className="text-gray-300" />
    return sort.dir === 'asc'
      ? <ChevronUp size={12} className="text-indigo-500" />
      : <ChevronDown size={12} className="text-indigo-500" />
  }

  function openEdit(t) {
    setDetail(null)
    setEditForm({
      id: t.id,
      oldAmount: t.amount,
      amount: String(t.amount),
      completed_at_date: t.completed_at
        ? format(new Date(t.completed_at), 'yyyy-MM-dd')
        : '',
      remark: t.remark ?? '',
    })
  }

  function submitEdit() {
    const f = editForm
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) return
    setConfirm({
      onConfirm: async () => {
        setSaving(true)
        const amountChanged = Number(f.amount) !== Number(f.oldAmount)
        if (amountChanged) {
          await supabase.rpc('increment_wallet_balance', { p_wallet_id: walletId, p_amount: Number(f.oldAmount) })
          await supabase.rpc('decrement_wallet_balance', { p_wallet_id: walletId, p_amount: Number(f.amount) })
        }
        await supabase.from('transactions').update({
          amount: Number(f.amount),
          completed_at: f.completed_at_date
            ? new Date(f.completed_at_date).toISOString()
            : null,
          remark: f.remark.trim() || null,
        }).eq('id', f.id)
        setSaving(false)
        setConfirm(null)
        setEditForm(null)
        fetchHistory()
      },
    })
  }

  return (
    <div>
      {/* Header: filter + page size */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Payment history</h2>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="all">All payments</option>
            {ruleNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">Show</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(e.target.value)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
            >
              {[10, 25, 50, 'all'].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* States */}
      {loading && <p className="text-xs text-gray-400">Loading history...</p>}
      {!loading && sorted.length === 0 && (
        <p className="text-xs text-gray-400">No completed payments yet.</p>
      )}

      {/* Table */}
      {!loading && sorted.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">
                  <button
                    onClick={() => toggleSort('name')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Name <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    onClick={() => toggleSort('due')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Due date <SortIcon col="due" />
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    onClick={() => toggleSort('completed')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Completed <SortIcon col="completed" />
                  </button>
                </th>
                <th className="px-4 py-2 text-right">
                  <button
                    onClick={() => toggleSort('amount')}
                    className="flex items-center gap-1 ml-auto hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Amount <SortIcon col="amount" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visible.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer bg-white dark:bg-gray-900"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800 dark:text-gray-100">
                      {t.recurring_rules?.name ?? '—'}
                    </p>
                    {t.recurring_rules?.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {t.recurring_rules.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {format(parseISO(t.date), 'd MMM yyyy')}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {t.completed_at
                      ? format(new Date(t.completed_at), 'd MMM yyyy')
                      : <span className="text-gray-300 dark:text-gray-600">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-green-600">
                    €{Number(t.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {pageSize === 'all' || Number(pageSize) >= sorted.length
                    ? `${sorted.length} payment${sorted.length !== 1 ? 's' : ''}`
                    : `Showing ${pageSize} of ${sorted.length} payments`
                  }
                </td>
                <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-200">
                  €{sorted.reduce((s, t) => s + Number(t.amount), 0).toFixed(2)} total
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Detail modal ────────────────────────────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Payment detail</h2>
              <button
                onClick={() => setDetail(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Name</span>
                <span className="font-medium text-gray-800 dark:text-gray-100">{detail.recurring_rules?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Due date</span>
                <span className="text-gray-700 dark:text-gray-200">{format(parseISO(detail.date), 'd MMM yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Completed</span>
                <span className="text-gray-700 dark:text-gray-200">
                  {detail.completed_at
                    ? format(new Date(detail.completed_at), 'd MMM yyyy')
                    : <span className="text-gray-300 dark:text-gray-600">—</span>
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Amount</span>
                <span className="font-semibold text-green-600">€{Number(detail.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Remark</span>
                <span className="text-gray-700 dark:text-gray-200 text-right max-w-[60%]">{detail.remark ?? '—'}</span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDetail(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Close
              </button>
              <button
                onClick={() => openEdit(detail)}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Edit payment</h2>
              <button
                onClick={() => setEditForm(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Amount (€)</label>
                <input
                  type="number"
                  value={editForm.amount}
                  onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                />
                {editForm.amount && Number(editForm.amount) !== Number(editForm.oldAmount) && (
                  <p className="text-xs text-amber-600 mt-1">
                    Changing the amount will update the wallet balance.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Completed date</label>
                <input
                  type="date"
                  value={editForm.completed_at_date}
                  onChange={e => setEditForm(f => ({ ...f, completed_at_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Remark (optional)</label>
                <input
                  value={editForm.remark}
                  onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))}
                  placeholder="Optional remark"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditForm(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ──────────────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Save changes?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {Number(editForm?.amount) !== Number(editForm?.oldAmount)
                ? `The amount will change from €${Number(editForm?.oldAmount).toFixed(2)} to €${Number(editForm?.amount).toFixed(2)} and the wallet balance will be updated.`
                : 'The payment details will be updated.'
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirm.onConfirm}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
