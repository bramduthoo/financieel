import { useEffect, useState } from 'react'
import {
  format, addMonths, subMonths, subYears, startOfMonth, endOfMonth, startOfYear,
  isBefore, isAfter, differenceInDays, addDays,
} from 'date-fns'
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculateProjectedCash, calculateMonthOutlook, getProjectedBalanceTimeline,
  getOverduePayments, getOverspentWallets, getUnderfundedWallets,
  calculateMonthMetrics, calculateMonthlyAverage, getHistoricalSeries, getYearlySeries,
} from '../lib/dashboardCalcs'
import IncomeSpendingChart from '../components/IncomeSpendingChart'
import CashTrendChart from '../components/CashTrendChart'
import ProjectedBalanceChart from '../components/ProjectedBalanceChart'

function fmtEUR(val) {
  const n = Number(val)
  return n < 0 ? `−€${Math.abs(n).toFixed(2)}` : `€${n.toFixed(2)}`
}

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

  const cash     = calculateProjectedCash(wallets, incomeRecurring, recurringRules, transactions)
  const timeline = getProjectedBalanceTimeline(wallets, incomeRecurring, recurringRules, transactions, 30)
  const cutoffDate = addDays(now, 30)
  const onTrack  = timeline.projectedEnd >= 0

  const months = Array.from({ length: 6 }, (_, i) =>
    calculateMonthOutlook(addMonths(now, i), incomeRecurring, recurringRules))
  const outlookMax = Math.max(1, ...months.flatMap(m => [m.income, m.costs]))

  const overdue     = getOverduePayments(recurringRules, transactions)
  const overspent   = getOverspentWallets(wallets, transactions, now)
  const underfunded = getUnderfundedWallets(wallets, recurringRules, transactions, distributionRules, incomeRecurring)
  const hasAlerts   = overdue.length > 0 || overspent.length > 0 || underfunded.length > 0
  const alertCount  = overdue.length + overspent.length + underfunded.length

  // group overdue payments by rule — one row per rule, not per payment
  const overdueGroups = Object.values(
    overdue.reduce((acc, o) => {
      if (!acc[o.rule.id]) acc[o.rule.id] = { rule: o.rule, count: 0, total: 0 }
      acc[o.rule.id].count += 1
      acc[o.rule.id].total += o.amount
      return acc
    }, {})
  )

  // Section 5 — this month's performance
  const metrics    = calculateMonthMetrics(now, transactions, incomeEntries)
  const prevMonths = [1, 2, 3].map(n => subMonths(now, n))
  const averages   = calculateMonthlyAverage(prevMonths, transactions, incomeEntries)

  const progressWallets = wallets
    .filter(w => w.type === 'fixed' || w.type === 'variable')
    .map(w => {
      const spent = transactions
        .filter(t => t.wallet_id === w.id && t.type === 'debit' && t.is_confirmed
          && !isBefore(new Date(t.date), monthStart) && !isAfter(new Date(t.date), monthEnd))
        .reduce((s, t) => s + Number(t.amount), 0)
      return { ...w, spent }
    })

  // Section 6 — over time
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
    <div>
      {/* Header */}
<<<<<<< HEAD
      <div className="mb-5">
        <h1 className="text-xl font-medium text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-600 mt-0.5">{monthLabel}</p>
      </div>

      {/* Projected balance hero */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">
              Projected balance · 30 days · {format(cutoffDate, 'dd/MM/yyyy')}
            </p>
            <p className={`text-3xl font-medium tracking-tight ${onTrack ? 'text-[#3B6D11]' : 'text-[#A32D2D]'}`}>
              {fmtEUR(timeline.projectedEnd)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Confidence</p>
            <div className="flex items-center justify-end gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${onTrack ? 'bg-[#3B6D11]' : 'bg-[#A32D2D]'}`} />
              <span className="text-[13px] font-medium text-gray-900">{onTrack ? 'On track' : 'At risk'}</span>
            </div>
          </div>
=======
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
>>>>>>> WOUTER
        </div>

        <ProjectedBalanceChart timeline={timeline} />

<<<<<<< HEAD
        <div className="h-px bg-stone-200 my-4" />

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Cash now</p>
            <p className="text-lg font-medium text-gray-900">{fmtEUR(cash.cashNow)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Expected income</p>
            <p className="text-lg font-medium text-gray-900">{fmtEUR(cash.expectedIncome)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Upcoming costs</p>
            <p className="text-lg font-medium text-gray-900">{fmtEUR(cash.upcomingCosts)}</p>
          </div>
        </div>
      </div>

      {/* 6-month outlook */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">6-month outlook</h2>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Net per month</p>
        </div>

        <div className="grid grid-cols-6 gap-1.5 mb-3">
          {months.map(m => {
            const negative = m.projectedNet < 0
            const incomeH = (m.income / outlookMax) * 28
            const costsH  = (m.costs / outlookMax) * 28
            return (
              <div
                key={m.month.toISOString()}
                className={`border rounded-lg px-2 py-2.5 text-center ${
                  negative ? 'bg-[#FCEBEB] border-[#F7C1C1]' : 'border-stone-200'
                }`}
              >
                <p className="text-[11px] text-gray-600 mb-1">{format(m.month, 'MMM')}</p>
                <svg viewBox="0 0 24 30" className="w-6 h-[30px] mx-auto mb-1">
                  <rect x={3}  y={28 - incomeH} width={6} height={incomeH} fill="#C0DD97" rx={1} />
                  <rect x={15} y={28 - costsH}  width={6} height={costsH}  fill="#F09595" rx={1} />
                </svg>
                <p className={`text-[11px] font-medium ${negative ? 'text-[#791F1F]' : 'text-gray-900'}`}>
                  {fmtEUR(m.projectedNet)}
                </p>
=======
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
>>>>>>> WOUTER
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#C0DD97]" /> Income
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#F09595]" /> Costs
          </span>
        </div>
      </div>

      {/* Needs attention */}
      {hasAlerts && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} color="#BA7517" />
            <h2 className="text-sm font-medium text-gray-900">Needs attention</h2>
            <span className="bg-[#FAEEDA] text-[#854F0B] text-[11px] font-medium px-2 py-0.5 rounded-full">
              {alertCount} alert{alertCount === 1 ? '' : 's'}
            </span>
          </div>

          {overdueGroups.map(g => (
            <div key={g.rule.id} className="flex items-center justify-between pt-3 pb-3 border-t border-stone-200">
              <div>
                <p className="text-[13px] font-medium text-gray-900">{g.rule.name}</p>
                <p className="text-xs text-gray-600">
                  {g.count} payment{g.count === 1 ? '' : 's'} overdue · {fmtEUR(g.total)}
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </div>
          ))}

          {overspent.map(o => (
            <div key={o.wallet.id} className="flex items-center justify-between pt-3 pb-3 border-t border-stone-200">
              <div>
                <p className="text-[13px] font-medium text-gray-900">{o.wallet.name}</p>
                <p className="text-xs text-gray-600">
                  {fmtEUR(o.spent)} spent of {fmtEUR(o.budget)} budget
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </div>
          ))}

          {underfunded.map(u => (
            <div key={u.wallet.id} className="flex items-center justify-between pt-3 pb-3 border-t border-stone-200">
              <div>
                <p className="text-[13px] font-medium text-gray-900">{u.wallet.name}</p>
                <p className="text-xs text-gray-600">
                  Needs {fmtEUR(u.shortfall)} more for upcoming payments
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </div>
          ))}
        </div>
      )}

<<<<<<< HEAD
      {!hasAlerts && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4 flex flex-col items-center justify-center py-6 gap-1.5">
          <CheckCircle2 size={20} className="text-[#3B6D11]" />
          <p className="text-[13px] font-medium text-gray-900">All clear</p>
        </div>
      )}

      {/* This month's performance */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricCard
          label="Income" value={fmtEUR(metrics.income)}
          current={metrics.income} avg={averages.income}
        />
        <MetricCard
          label="Spending" value={fmtEUR(metrics.spending)}
          current={metrics.spending} avg={averages.spending} lowerIsBetter
        />
        <MetricCard
          label="Net saved" value={fmtEUR(metrics.net)}
          current={metrics.net} avg={averages.net} highlight
        />
        {metrics.income > 0 && (
          <MetricCard
            label="Savings rate" value={`${metrics.savingsRate.toFixed(1)}%`}
            current={metrics.savingsRate} avg={averages.savingsRate} unit="pp"
          />
        )}
      </div>

      {/* Wallet progress */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Wallet progress</h2>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{monthLabel}</p>
        </div>

        {progressWallets.length === 0 ? (
          <p className="text-sm text-gray-400">No wallets to show.</p>
        ) : (
          progressWallets.map((w, i) => {
            const budget = Number(w.budget)
            const pct    = budget > 0 ? (w.spent / budget) * 100 : 0
            const barColour = pct >= 100 ? 'bg-[#E24B4A]' : pct >= 75 ? 'bg-[#EF9F27]' : 'bg-[#97C459]'
            const isAccumulating = w.type === 'variable' && w.budget_type === 'accumulating'
            return (
              <div key={w.id} className={i === progressWallets.length - 1 ? '' : 'mb-3'}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[13px] font-medium text-gray-900">
                    {w.name}
                    {isAccumulating && (
                      <span className="text-gray-400 font-normal"> · balance {fmtEUR(w.balance)}</span>
                    )}
                  </p>
                  <p className="text-[11.5px] text-gray-600">
                    <span className={pct >= 100 ? 'text-[#A32D2D] font-medium' : ''}>{fmtEUR(w.spent)}</span>
                    {' '}· {fmtEUR(budget)} budget
                  </p>
                </div>
                <div className="h-1 bg-stone-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColour}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Over time */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Over time</h2>
          {hasYearOfData && (
            <div className="flex gap-1 bg-stone-100 rounded-lg p-1">
=======
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
>>>>>>> WOUTER
              {[['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
<<<<<<< HEAD
                    viewMode === id ? 'bg-white text-gray-900' : 'text-gray-500 hover:text-gray-700'
=======
                    viewMode === id
                      ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
>>>>>>> WOUTER
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <IncomeSpendingChart data={series} />
          <CashTrendChart data={series} />
        </div>
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

function MetricCard({ label, value, current, avg, lowerIsBetter = false, unit = 'eur', highlight = false }) {
  let trend = null
  if (avg !== null && avg !== undefined && current !== null && current !== undefined) {
    const diff   = current - avg
    const good   = lowerIsBetter ? diff <= 0 : diff >= 0
    const arrow  = diff >= 0 ? '↑' : '↓'
    const amount = unit === 'pp' ? `${Math.abs(diff).toFixed(1)}pp` : `€${Math.abs(diff).toFixed(0)}`
    trend = (
      <span className={`text-[11px] font-medium ${good ? 'text-[#3B6D11]' : 'text-[#A32D2D]'}`}>
        {arrow} {amount}
      </span>
    )
  }

  return (
<<<<<<< HEAD
    <div className="bg-white border border-stone-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{label}</p>
        {trend}
      </div>
      <p className={`text-2xl font-medium ${highlight ? 'text-[#3B6D11]' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-1">vs 3-month avg</p>
=======
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{value}</p>
      {comparison}
>>>>>>> WOUTER
    </div>
  )
}
