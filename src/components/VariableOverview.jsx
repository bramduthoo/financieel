import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import VariableTransactionForm from './VariableTransactionForm'
import VariableTransactionList from './VariableTransactionList'

export default function VariableOverview({ walletId, wallet, onBalanceChanged }) {
  const [viewMonth,   setViewMonth]   = useState(startOfMonth(new Date()))
  const [editTarget,  setEditTarget]  = useState(null)
  const [monthDebits, setMonthDebits] = useState(0)
  const [refreshKey,  setRefreshKey]  = useState(0)

  useEffect(() => { fetchMonthSummary() }, [walletId])

  async function fetchMonthSummary() {
    const from = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const to   = format(endOfMonth(new Date()),   'yyyy-MM-dd')
    const { data } = await supabase
      .from('transactions')
      .select('amount')
      .eq('wallet_id', walletId)
      .eq('type', 'debit')
      .gte('date', from)
      .lte('date', to)
    setMonthDebits((data ?? []).reduce((s, t) => s + Number(t.amount), 0))
  }

  function handleFormSaved() {
    setEditTarget(null)
    fetchMonthSummary()
    setRefreshKey(k => k + 1)
    onBalanceChanged()
  }

  function handleListChanged() {
    fetchMonthSummary()
    onBalanceChanged()
  }

  function handleEdit(t) {
    setViewMonth(startOfMonth(new Date()))
    setEditTarget(t)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isCurrentMonth = isSameMonth(viewMonth, new Date())
  const budget = Number(wallet.budget)
  const pct    = budget > 0 ? (monthDebits / budget) * 100 : 0
  const barColour  = pct >= 100 ? 'bg-red-500'   : pct >= 75 ? 'bg-amber-400' : 'bg-green-500'
  const textColour = pct >= 100 ? 'text-red-600'  : pct >= 75 ? 'text-amber-600' : 'text-green-600'

  return (
    <div className="space-y-5">
      {/* Budget progress — always shows current month */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            {format(new Date(), 'MMMM')} spending
          </h2>
          <span className={`text-sm font-semibold ${textColour}`}>
            {pct.toFixed(0)}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full transition-all ${barColour}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">
          €{monthDebits.toFixed(2)} spent of €{budget.toFixed(2)} monthly budget
        </p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setViewMonth(m => subMonths(m, 1))}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {format(viewMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewMonth(m => addMonths(m, 1))}
          disabled={isCurrentMonth}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Add / edit form — current month only */}
      {isCurrentMonth && (
        <VariableTransactionForm
          walletId={walletId}
          onSaved={handleFormSaved}
          editTarget={editTarget}
          onCancelEdit={() => setEditTarget(null)}
        />
      )}

      {/* Monthly transaction list */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Transactions</h2>
        <VariableTransactionList
          walletId={walletId}
          viewMonth={viewMonth}
          refreshKey={refreshKey}
          onChanged={handleListChanged}
          onEdit={handleEdit}
        />
      </div>
    </div>
  )
}
