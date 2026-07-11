import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'

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
    if (sort.key !== col) return <ChevronUp size={12} className="text-ink-faint" />
    return sort.dir === 'asc'
      ? <ChevronUp size={12} className="text-ink" />
      : <ChevronDown size={12} className="text-ink" />
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
          className="text-xs border border-card-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent min-w-[160px]"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-xs border border-card-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent"
        >
          <option value="all">All types</option>
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-ink-faint">Show</span>
          <select
            value={pageSize === 'all' ? 'all' : pageSize}
            onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-card-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent"
          >
            {[10, 25, 50, 'all'].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-faint">Loading history…</p>
      ) : (
        <div className="bg-card rounded-[14px] border border-card-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-track text-xs text-ink-muted uppercase tracking-wide border-b border-card-border">
              <tr>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-ink">
                    Date <SortIcon col="date" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-ink">
                    Name <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-ink">
                    Amount <SortIcon col="amount" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-ink-faint text-xs">
                    No transactions found
                  </td>
                </tr>
              ) : visible.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className="hover:bg-track cursor-pointer"
                >
                  <td className="px-4 py-2.5 text-ink-muted whitespace-nowrap">
                    {format(parseISO(t.date), 'd MMM yyyy')}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-ink">{t.note ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-negative">
                    {formatMoney(-Number(t.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-track border-t border-card-border text-xs">
              <tr>
                <td colSpan={2} className="px-4 py-2 text-ink-muted">
                  {pageSize === 'all' || Number(pageSize) >= filtered.length
                    ? `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`
                    : `Showing ${visible.length} of ${filtered.length}`
                  }
                </td>
                <td className="px-4 py-2 text-right font-medium text-negative">
                  {formatMoney(-totalSpent)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

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
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDetail(null)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Close</button>
              <button onClick={() => openEdit(detail)} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ────────────────────────────────────────────────────────── */}
      {editForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-ink">Edit transaction</h2>
              <button onClick={() => setEditForm(null)} className="p-1.5 text-ink-faint hover:text-ink-soft rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-card-border rounded-[8px] text-sm bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Amount (€)</label>
                <input
                  type="number" value={editForm.amount}
                  onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-card-border rounded-[8px] text-sm bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                {editForm.amount && Number(editForm.amount) !== Number(editForm.oldAmount) && (
                  <p className="text-xs text-[#854F0B] mt-1">Changing the amount will update the wallet balance.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Date</label>
                <input
                  type="date" value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-card-border rounded-[8px] text-sm bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Note (optional)</label>
                <input
                  value={editForm.remark}
                  onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))}
                  className="w-full px-3 py-2 border border-card-border rounded-[8px] text-sm bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditForm(null)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
              <button onClick={submitEdit} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ────────────────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-ink mb-2">Save changes?</h2>
            <p className="text-sm text-ink-muted mb-6">
              {Number(editForm?.amount) !== Number(editForm?.oldAmount)
                ? `Amount changes from ${formatMoney(Number(editForm?.oldAmount))} to ${formatMoney(Number(editForm?.amount))}. The wallet balance will be updated.`
                : 'The transaction details will be updated.'
              }
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
              <button
                onClick={confirm.onConfirm}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
