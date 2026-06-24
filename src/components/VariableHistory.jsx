import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function VariableHistory({ walletId }) {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [sort,         setSort]         = useState({ key: 'date', dir: 'desc' })
  const [pageSize,     setPageSize]     = useState(10)

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
    list.sort((a, b) => {
      let av, bv
      if (sort.key === 'date')   { av = a.date;           bv = b.date }
      if (sort.key === 'amount') { av = Number(a.amount); bv = Number(b.amount) }
      if (sort.key === 'note')   { av = a.note ?? '';     bv = b.note ?? '' }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ?  1 : -1
      return 0
    })
    return list
  }, [transactions, typeFilter, sort])

  const visible = pageSize === 'all' ? filtered : filtered.slice(0, Number(pageSize))

  const totalDebit  = filtered.filter(t => t.type === 'debit').reduce((s, t)  => s + Number(t.amount), 0)
  const totalCredit = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0)
  const net = totalCredit - totalDebit

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

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
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
                  <button onClick={() => toggleSort('note')} className="flex items-center gap-1 hover:text-gray-700">
                    Note <SortIcon col="note" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left">Type</th>
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
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-xs">
                    No transactions found
                  </td>
                </tr>
              ) : visible.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {format(parseISO(t.date), 'd MMM yyyy')}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{t.note ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      t.type === 'debit' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                    }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${
                    t.type === 'debit' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {t.type === 'debit' ? '-' : '+'}€{Number(t.amount).toFixed(2)}
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
                <td className="px-4 py-2 text-gray-500">
                  <span className="text-red-500">−€{totalDebit.toFixed(2)}</span>
                  {' · '}
                  <span className="text-green-600">+€{totalCredit.toFixed(2)}</span>
                </td>
                <td className={`px-4 py-2 text-right font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {net >= 0 ? '+' : '−'}€{Math.abs(net).toFixed(2)} net
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
