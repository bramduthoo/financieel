import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { ChevronUp, ChevronDown } from 'lucide-react'

export default function PaymentHistory({ walletId }) {
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [sort,     setSort]     = useState({ key: 'due', dir: 'desc' })
  const [pageSize, setPageSize] = useState(10)

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

  return (
    <div>
      {/* Header: filter + page size */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Payment history</h2>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All payments</option>
            {ruleNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Show</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">
                  <button
                    onClick={() => toggleSort('name')}
                    className="flex items-center gap-1 hover:text-gray-700"
                  >
                    Payment <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    onClick={() => toggleSort('due')}
                    className="flex items-center gap-1 hover:text-gray-700"
                  >
                    Due date <SortIcon col="due" />
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    onClick={() => toggleSort('completed')}
                    className="flex items-center gap-1 hover:text-gray-700"
                  >
                    Completed <SortIcon col="completed" />
                  </button>
                </th>
                <th className="px-4 py-2 text-left">Remark</th>
                <th className="px-4 py-2 text-right">
                  <button
                    onClick={() => toggleSort('amount')}
                    className="flex items-center gap-1 ml-auto hover:text-gray-700"
                  >
                    Amount <SortIcon col="amount" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800">
                      {t.recurring_rules?.name ?? '—'}
                    </p>
                    {t.recurring_rules?.description && (
                      <p className="text-xs text-gray-400">
                        {t.recurring_rules.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {format(parseISO(t.date), 'd MMM yyyy')}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {t.completed_at
                      ? format(new Date(t.completed_at), 'd MMM yyyy')
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-xs italic text-gray-400">
                    {t.remark ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-green-600">
                    €{Number(t.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-xs text-gray-500">
                  {pageSize === 'all' || Number(pageSize) >= sorted.length
                    ? `${sorted.length} payment${sorted.length !== 1 ? 's' : ''}`
                    : `Showing ${pageSize} of ${sorted.length} payments`
                  }
                </td>
                <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700">
                  €{sorted.reduce((s, t) => s + Number(t.amount), 0).toFixed(2)} total
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}