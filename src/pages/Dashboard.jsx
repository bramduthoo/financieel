import { useEffect, useState } from 'react'
import {
  format, addMonths, subMonths, subYears, startOfMonth, endOfMonth, startOfYear,
  isBefore, isAfter, differenceInDays,
} from 'date-fns'
import { AlertCircle, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculateProjectedCash, calculateMonthOutlook,
  getOverduePayments, getOverspentWallets, getUnderfundedWallets,
  calculateMonthMetrics, calculateMonthlyAverage, getHistoricalSeries, getYearlySeries,
} from '../lib/dashboardCalcs'
import IncomeSpendingChart from '../components/IncomeSpendingChart'
import CashTrendChart from '../components/CashTrendChart'

export default function Dashboard() {
  const [wallets,            setWallets]            = useState([])
  const [incomeRecurring,    setIncomeRecurring]    = useState([])
  const [recurringRules,     setRecurringRules]     = useState([])
  const [transactions,       setTransactions]       = useState([])
  const [distributionRules,  setDistributionRules]  = useState([])
  const [incomeEntries,      setIncomeEntries]      = useState([])
  const [viewMode,           setViewMode]           = useState('monthly')
  const [loading,            setLoading]            = useState(true)

  const now        = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd   = endOfMonth(now)
  const monthLabel = format(now, 'MMMM yyyy')

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const [{ data: w }, { data: ir }, { data: rr }, { data: tx }, { data: dr }, { data: ie }] = await Promise.all([
        supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('income_recurring').select('*'),
        supabase.from('recurring_rules').select('*').is('end_date', null),
        supabase.from('transactions').select('*'),
        supabase.from('income_distribution_rules').select('*'),
        supabase.from('income_entries').select('*'),
      ])
      setWallets(w ?? [])
      setIncomeRecurring(ir ?? [])
      setRecurringRules(rr ?? [])
      setTransactions(tx ?? [])
      setDistributionRules(dr ?? [])
      setIncomeEntries(ie ?? [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  if (loading) return <p className="text-gray-400">Loading dashboard...</p>

  const cash = calculateProjectedCash(wallets, incomeRecurring, recurringRules, transactions)

  const months = Array.from({ length: 6 }, (_, i) =>
    calculateMonthOutlook(addMonths(now, i), incomeRecurring, recurringRules))

  const overdue    = getOverduePayments(recurringRules, transactions)
  const overspent  = getOverspentWallets(wallets, transactions, now)
  const underfunded = getUnderfundedWallets(wallets, recurringRules, transactions, distributionRules, incomeRecurring)
  const hasAlerts  = overdue.length > 0 || overspent.length > 0 || underfunded.length > 0

  // Section 3 — this month's performance
  const metrics     = calculateMonthMetrics(now, transactions, incomeEntries)
  const prevMonths  = [1, 2, 3].map(n => subMonths(now, n))
  const averages    = calculateMonthlyAverage(prevMonths, transactions, incomeEntries)

  const progressWallets = wallets
    .filter(w => w.type === 'fixed' || w.type === 'variable')
    .map(w => {
      const spent = transactions
        .filter(t => t.wallet_id === w.id && t.type === 'debit' && t.is_confirmed
          && !isBefore(new Date(t.date), monthStart) && !isAfter(new Date(t.date), monthEnd))
        .reduce((s, t) => s + Number(t.amount), 0)
      return { ...w, spent }
    })

  // Section 4 — over time
  const allDated = [...transactions, ...incomeEntries]
  const earliestDate = allDated.length > 0
    ? allDated.reduce((min, r) => (new Date(r.date) < min ? new Date(r.date) : min), new Date(allDated[0].date))
    : null
  const hasYearOfData = earliestDate !== null && differenceInDays(now, earliestDate) >= 365
  const effectiveViewMode = hasYearOfData ? viewMode : 'monthly'

  let series
  if (effectiveViewMode === 'monthly') {
    const monthsBack = Array.from({ length: 12 }, (_, i) => subMonths(startOfMonth(now), 11 - i))
    series = getHistoricalSeries(monthsBack, transactions, incomeEntries, wallets)
      .map(d => ({ label: format(d.month, 'MMM'), income: d.income, spending: d.spending, totalCash: d.totalCash }))
  } else {
    const yearsBack = Array.from({ length: 5 }, (_, i) => subYears(startOfYear(now), 4 - i))
    series = getYearlySeries(yearsBack, transactions, incomeEntries, wallets)
      .map(d => ({ label: format(d.year, 'yyyy'), income: d.income, spending: d.spending, totalCash: d.totalCash }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{monthLabel}</p>
      </div>

      {/* Section 1 — Projected cash position */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Next 30 days</h2>

        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
          <span>Cash now: <span className="font-semibold text-gray-800 dark:text-gray-100">€{cash.cashNow.toFixed(2)}</span></span>
          <span>+</span>
          <span>Expected income: <span className="font-semibold text-green-600">€{cash.expectedIncome.toFixed(2)}</span></span>
          <span>−</span>
          <span>Upcoming costs: <span className="font-semibold text-red-500">€{cash.upcomingCosts.toFixed(2)}</span></span>
          <span>=</span>
          <span>Projected balance:</span>
        </div>

        <div className={`inline-block px-6 py-3 rounded-full text-2xl font-bold ${
          cash.projected >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
        }`}>
          €{cash.projected.toFixed(2)}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          If today is the 5th of the month and your salary arrives on the 30th, this shows
          your projected balance at the end of the next 30-day window.
        </p>
      </div>

      {/* Section 1.5 — Months ahead outlook */}
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">6-month outlook</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {months.map(m => (
            <div key={m.month.toISOString()} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{format(m.month, 'MMM yyyy')}</p>
              <div className={`flex items-center gap-1 text-sm font-semibold ${
                m.projectedNet >= 0 ? 'text-green-600' : 'text-red-500'
              }`}>
                {m.projectedNet >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                €{m.projectedNet.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 — Needs attention */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Needs attention</h2>

        {!hasAlerts && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-2 text-green-600">
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">All clear</span>
          </div>
        )}

        {overdue.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-red-500 p-5">
            <div className="flex items-center gap-2 text-red-500 mb-2">
              <AlertCircle size={18} />
              <span className="text-sm font-semibold">
                {overdue.length} overdue payment{overdue.length === 1 ? '' : 's'} totalling €
                {overdue.reduce((s, o) => s + o.amount, 0).toFixed(2)}
              </span>
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
              {overdue.slice(0, 5).map((o, i) => (
                <li key={i}>
                  {o.rule.name} — €{o.amount.toFixed(2)} — due {format(o.dueDate, 'd MMM yyyy')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {overspent.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-red-500 p-5">
            <div className="flex items-center gap-2 text-red-500 mb-2">
              <AlertCircle size={18} />
              <span className="text-sm font-semibold">
                {overspent.length} wallet{overspent.length === 1 ? '' : 's'} overspent this month
              </span>
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
              {overspent.map(o => (
                <li key={o.wallet.id}>
                  {o.wallet.name}: €{o.spent.toFixed(2)} spent of €{o.budget.toFixed(2)} budget
                </li>
              ))}
            </ul>
          </div>
        )}

        {underfunded.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-orange-500 p-5">
            <div className="flex items-center gap-2 text-orange-500 mb-2">
              <AlertTriangle size={18} />
              <span className="text-sm font-semibold">
                {underfunded.length} wallet{underfunded.length === 1 ? '' : 's'} need more funding
              </span>
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
              {underfunded.map(u => (
                <li key={u.wallet.id}>
                  {u.wallet.name}: needs €{u.shortfall.toFixed(2)} more for upcoming payments
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Section 3 — This month's performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">This month's performance</h2>
          <div className="grid grid-cols-2 gap-6">
            <MetricCard
              label="Income" value={`€${metrics.income.toFixed(2)}`}
              current={metrics.income} avg={averages.income}
            />
            <MetricCard
              label="Spending" value={`€${metrics.spending.toFixed(2)}`}
              current={metrics.spending} avg={averages.spending} lowerIsBetter
            />
            <MetricCard
              label="Net" value={`€${metrics.net.toFixed(2)}`}
              current={metrics.net} avg={averages.net}
            />
            {metrics.income > 0 && (
              <MetricCard
                label="Savings rate" value={`${metrics.savingsRate.toFixed(1)}%`}
                current={metrics.savingsRate} avg={averages.savingsRate} unit="pp"
              />
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Wallet progress</h2>
          {progressWallets.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No wallets to show.</p>
          ) : (
            <div className="space-y-4">
              {progressWallets.map(w => {
                const budget = Number(w.budget)
                const pct    = budget > 0 ? (w.spent / budget) * 100 : 0
                const barColour = pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-orange-500' : 'bg-green-500'
                return (
                  <div key={w.id}>
                    <div className="flex items-center gap-2 text-sm mb-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: w.colour }} />
                      <span className="text-gray-700 dark:text-gray-200 font-medium">{w.name}</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-1">
                      <div className={`h-full rounded-full ${barColour}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>€{w.spent.toFixed(2)} spent of €{budget.toFixed(2)} budget</span>
                      {w.type === 'variable' && w.budget_type === 'accumulating' && (
                        <span className="text-gray-400 dark:text-gray-500">Balance: €{Number(w.balance).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 4 — Over time */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Over time</h2>
          {hasYearOfData && (
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {[['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    viewMode === id
                      ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <IncomeSpendingChart data={series} />
        <CashTrendChart data={series} />
      </div>

      {/* No data state */}
      {wallets.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-lg font-medium mb-1">Nothing here yet</p>
          <p className="text-sm">Add your wallets and log your income to see your overview</p>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, current, avg, lowerIsBetter = false, unit = 'eur' }) {
  let comparison = null
  if (avg !== null && avg !== undefined && current !== null && current !== undefined) {
    const diff   = current - avg
    const better = lowerIsBetter ? diff <= 0 : diff >= 0
    const sign   = diff >= 0 ? '+' : '−'
    const amount = unit === 'pp' ? `${Math.abs(diff).toFixed(1)}pp` : `€${Math.abs(diff).toFixed(0)}`
    comparison = (
      <p className={`text-xs mt-1 ${better ? 'text-green-600' : 'text-red-500'}`}>
        {sign}{amount} vs avg
      </p>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{value}</p>
      {comparison}
    </div>
  )
}
