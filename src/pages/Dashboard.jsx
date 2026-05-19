import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [wallets,  setWallets]  = useState([])
  const [income,   setIncome]   = useState([])
  const [loading,  setLoading]  = useState(true)

  const now        = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd   = endOfMonth(now)
  const monthLabel = format(now, 'MMMM yyyy')

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const [{ data: w }, { data: i }] = await Promise.all([
        supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('income_entries').select('*')
          .gte('date', format(monthStart, 'yyyy-MM-dd'))
          .lte('date', format(monthEnd,   'yyyy-MM-dd')),
      ])
      setWallets(w ?? [])
      setIncome(i  ?? [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  const totalIncome    = income.reduce((s, e) => s + Number(e.amount), 0)
  const totalAllocated = wallets
    .filter(w => w.type !== 'investment')
    .reduce((s, w) => s + Number(w.budget), 0)
  const unallocated    = totalIncome - totalAllocated

  const fixedWallets    = wallets.filter(w => w.type === 'fixed')
  const variableWallets = wallets.filter(w => w.type === 'variable')

  if (loading) return <p className="text-gray-400">Loading dashboard...</p>

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{monthLabel}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <SummaryCard
          label="Income this month"
          value={`€${totalIncome.toFixed(2)}`}
          colour="text-green-600"
          bg="bg-green-50"
        />
        <SummaryCard
          label="Total allocated"
          value={`€${totalAllocated.toFixed(2)}`}
          colour="text-indigo-600"
          bg="bg-indigo-50"
        />
        <SummaryCard
          label="Unallocated"
          value={`€${unallocated.toFixed(2)}`}
          colour={unallocated >= 0 ? 'text-gray-800' : 'text-red-500'}
          bg={unallocated >= 0 ? 'bg-gray-50' : 'bg-red-50'}
        />
      </div>

      {/* Wallet budget overview */}
      {wallets.filter(w => w.type !== 'investment').length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Budget allocation</h2>
          <div className="space-y-3">
            {[...fixedWallets, ...variableWallets].map(w => {
              const pct = totalIncome > 0
                ? Math.min((Number(w.budget) / totalIncome) * 100, 100)
                : 0
              return (
                <div key={w.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{w.name}</span>
                    <span className="text-gray-500">€{Number(w.budget).toFixed(2)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: w.colour }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* No data state */}
      {wallets.length === 0 && income.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-1">Nothing here yet</p>
          <p className="text-sm">Add your wallets and log your income to see your overview</p>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, colour, bg }) {
  return (
    <div className={`${bg} rounded-xl p-5`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colour}`}>{value}</p>
    </div>
  )
}