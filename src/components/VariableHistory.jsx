import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function VariableHistory({ walletId }) {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [sort,         setSort]         = useState({ key: 'date', dir: 'desc' })
  const [pageSize,     setPageSize]     = useState(10)

  const [detail,   setDetail]   = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [confirm,  setConfirm]  = useState(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => { fetchAll() }, [walletId])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('date', { ascending: false })
    setTransactions(data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let list = [...transactions]
    if (typeFilter !== 'all') list = list.filter(t => t.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => (t.note ?? '').toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      let av, bv
      if (sort.key === 'date')   { av = a.date;           bv = b.date }
      if (sort.key === 'amount') { av = Number(a.amount); bv = Number(b.amount) }
      if (sort.key === 'name')   { av = a.note ?? '';     bv = b.note ?? '' }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ?  1 : -1
      return 0
    })
    return list
  }, [transactions, search, typeFilter, sort])

  const visible   = pageSize === 'all' ? filtered : filtered.slice(0, Number(pageSize))
  const totalSpent = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0)

  function toggleSort(key) {
    setSort(s => s.key === key
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
      name: t.note ?? '',
      amount: String(t.amount),
      date: t.date,
      remark: t.remark ?? '',
    })
  }

  function submitEdit() {
    const f = editForm
    if (!f.name.trim())                                              return
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) return
    setConfirm({
      onConfirm: async () => {
        setSaving(true)
        // Was always debit — reverse with increment, apply new with decrement
        await supabase.rpc('increment_wallet_balance', { p_wallet_id: walletId, p_amount: Number(f.oldAmount) })
        await supabase.rpc('decrement_wallet_balance', { p_wallet_id: walletId, p_amount: Number(f.amount) })
        await supabase.from('transactions').update({
          amount: Number(f.amount),
          date: f.date,
          note: f.name.trim(),
          remark: f.remark.trim() || null,
        }).eq('id', f.id)
        setSaving(false)
        setConfirm(null)
        setEditForm(null)
        fetchAll()
      },
    })
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All types</option>
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Show</span>
          <select
            value={pageSize === 'all' ? 'all' : pageSize}
            onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[10, 25, 50, 'all'].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading history…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-gray-700">
                    Date <SortIcon col="date" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-gray-700">
                    Name <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-gray-700">
                    Amount <SortIcon col="amount" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-gray-400 text-xs">
                    No transactions found
                  </td>
                </tr>
              ) : visible.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {format(parseISO(t.date), 'd MMM yyyy')}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{t.note ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-red-600">
                    -€{Number(t.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200 text-xs">
              <tr>
                <td colSpan={2} className="px-4 py-2 text-gray-500">
                  {pageSize === 'all' || Number(pageSize) >= filtered.length
                    ? `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`
                    : `Showing ${visible.length} of ${filtered.length}`
                  }
                </td>
                <td className="px-4 py-2 text-right font-semibold text-red-600">
                  -€{totalSpent.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Detail modal ──────────────────────────────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Transaction detail</h2>
              <button onClick={() => setDetail(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-800">{detail.note ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-red-600">-€{Number(detail.amount).toFixed(2)}</span>
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
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDetail(null)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button onClick={() => openEdit(detail)} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ────────────────────────────────────────────────────────── */}
      {editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit transaction</h2>
              <button onClick={() => setEditForm(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
                <input
                  type="number" value={editForm.amount}
                  onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {editForm.amount && Number(editForm.amount) !== Number(editForm.oldAmount) && (
                  <p className="text-xs text-amber-600 mt-1">Changing the amount will update the wallet balance.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date" value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <input
                  value={editForm.remark}
                  onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditForm(null)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={submitEdit} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ────────────────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Save changes?</h2>
            <p className="text-sm text-gray-500 mb-6">
              {Number(editForm?.amount) !== Number(editForm?.oldAmount)
                ? `Amount changes from €${Number(editForm?.oldAmount).toFixed(2)} to €${Number(editForm?.amount).toFixed(2)}. The wallet balance will be updated.`
                : 'The transaction details will be updated.'
              }
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
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
