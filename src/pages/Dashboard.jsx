import { useEffect, useState } from 'react'
import {
  format, addMonths, subMonths, subYears, startOfMonth, endOfMonth, startOfYear,
  isBefore, isAfter, differenceInDays, addDays,
} from 'date-fns'
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculateProjectedCash, calculateMonthOutlook, getProjectedBalanceTimeline,
  getOverduePayments, getOverspentWallets, getUnderfundedWallets,
  calculateMonthMetrics, calculateMonthlyAverage, getHistoricalSeries, getYearlySeries,
} from '../lib/dashboardCalcs'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'
import IncomeSpendingChart from '../components/IncomeSpendingChart'
import CashTrendChart from '../components/CashTrendChart'
import ProjectedBalanceChart from '../components/ProjectedBalanceChart'
import UnallocatedConflictBanner from '../components/UnallocatedConflictBanner'

export default function Dashboard() {
  const [wallets,            setWallets]            = useState([])
  const [incomeRecurring,    setIncomeRecurring]    = useState([])
  const [recurringRules,     setRecurringRules]     = useState([])
  const [transactions,       setTransactions]       = useState([])
  const [distributionRules,  setDistributionRules]  = useState([])
  const [incomeEntries,      setIncomeEntries]      = useState([])
  const [viewMode,           setViewMode]           = useState('monthly')
  const [loading,            setLoading]            = useState(true)
  const [refreshKey,         setRefreshKey]         = useState(0)

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
  }, [refreshKey])

  if (loading) return <p className="text-ink-muted">Loading dashboard...</p>

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

  const sectionLabel = 'text-[11px] font-medium uppercase tracking-wider text-ink-muted'
  const cardClass = 'bg-card border border-card-border rounded-[14px] p-6'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-ink">Dashboard</h1>
        <p className="text-ink-soft text-sm mt-1">{monthLabel}</p>
      </div>

      {/* Multi-plan conflict banner */}
      <UnallocatedConflictBanner onChange={() => setRefreshKey(k => k + 1)} />

      {/* Section 1 — Projected cash position */}
      <div className={cardClass}>
        <h2 className={`${sectionLabel} mb-4`}>Next 30 days</h2>

        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft mb-4">
          <span>Cash now: <span className="font-medium text-ink">{formatMoney(cash.cashNow)}</span></span>
          <span>+</span>
          <span>Expected income: <span className="font-medium text-positive">{formatMoney(cash.expectedIncome)}</span></span>
          <span>−</span>
          <span>Upcoming costs: <span className="font-medium text-negative">{formatMoney(cash.upcomingCosts)}</span></span>
          <span>=</span>
          <span>Projected balance:</span>
        </div>

        <ProjectedBalanceChart timeline={timeline} />

        <p className="text-xs text-ink-faint mt-4">
          If today is the 5th of the month and your salary arrives on the 30th, this shows
          your projected balance at the end of the next 30-day window.
        </p>
      </div>

      {/* Section 1.5 — Months ahead outlook */}
      <div>
        <p className={`${sectionLabel} mb-2`}>6-month outlook</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {months.map(m => (
            <div key={m.month.toISOString()} className="min-w-0 bg-card border border-card-border rounded-[14px] p-4">
              <p className="text-xs text-ink-muted mb-1">{format(m.month, 'MMM yyyy')}</p>
              <div className={`flex items-center gap-1 min-w-0 text-sm font-medium ${
                m.projectedNet >= 0 ? 'text-positive' : 'text-negative'
              }`}>
                {m.projectedNet >= 0 ? <TrendingUp size={14} className="shrink-0" /> : <TrendingDown size={14} className="shrink-0" />}
                <span className="truncate tabular-nums">{formatMoney(m.projectedNet)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-positive-bar" /> Income
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-negative-bar" /> Costs
          </span>
        </div>
      </div>

      {/* Needs attention */}
      {hasAlerts && (
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-warning" />
            <h2 className="text-sm font-medium text-ink">Needs attention</h2>
            <span className="bg-[#FAEEDA] text-[#854F0B] dark:bg-warning/15 dark:text-warning text-[11px] font-medium px-2 py-0.5 rounded-full">
              {alertCount} alert{alertCount === 1 ? '' : 's'}
            </span>
          </div>

          {overdueGroups.map(g => (
            <div key={g.rule.id} className="flex items-center justify-between pt-3 pb-3 border-t border-inner-border">
              <div>
                <p className="text-[13px] font-medium text-ink">{g.rule.name}</p>
                <p className="text-xs text-ink-soft">
                  {g.count} payment{g.count === 1 ? '' : 's'} overdue · {formatMoney(g.total)}
                </p>
              </div>
              <ChevronRight size={16} className="text-ink-faint" />
            </div>
          ))}

          {overspent.map(o => (
            <div key={o.wallet.id} className="flex items-center justify-between pt-3 pb-3 border-t border-inner-border">
              <div>
                <p className="text-[13px] font-medium text-ink">{o.wallet.name}</p>
                <p className="text-xs text-ink-soft">
                  {formatMoney(o.spent)} spent of {formatMoney(o.budget)} budget
                </p>
              </div>
              <ChevronRight size={16} className="text-ink-faint" />
            </div>
          ))}

          {underfunded.map(u => (
            <div key={u.wallet.id} className="flex items-center justify-between pt-3 pb-3 border-t border-inner-border">
              <div>
                <p className="text-[13px] font-medium text-ink">{u.wallet.name}</p>
                <p className="text-xs text-ink-soft">
                  Needs {formatMoney(u.shortfall)} more for upcoming payments
                </p>
              </div>
              <ChevronRight size={16} className="text-ink-faint" />
            </div>
          ))}
        </div>
      )}

      {/* Section 2 — Needs attention */}
      <div className="space-y-3">
        <h2 className={sectionLabel}>Needs attention</h2>

        {!hasAlerts && (
          <div className={`${cardClass} flex items-center gap-2 text-positive`}>
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">All clear</span>
          </div>
        )}

        {overdue.length > 0 && (
          <div className={`${cardClass} border-l-4 border-l-negative-bar`}>
            <div className="flex items-center gap-2 text-negative mb-2">
              <AlertCircle size={18} />
              <span className="text-sm font-medium">
                {overdue.length} overdue payment{overdue.length === 1 ? '' : 's'} totalling {formatMoney(overdue.reduce((s, o) => s + o.amount, 0))}
              </span>
            </div>
            <ul className="text-sm text-ink-soft space-y-1">
              {overdue.slice(0, 5).map((o, i) => (
                <li key={i}>
                  {o.rule.name} — {formatMoney(o.amount)} — due {format(o.dueDate, 'd MMM yyyy')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {overspent.length > 0 && (
          <div className={`${cardClass} border-l-4 border-l-negative-bar`}>
            <div className="flex items-center gap-2 text-negative mb-2">
              <AlertCircle size={18} />
              <span className="text-sm font-medium">
                {overspent.length} wallet{overspent.length === 1 ? '' : 's'} overspent this month
              </span>
            </div>
            <ul className="text-sm text-ink-soft space-y-1">
              {overspent.map(o => (
                <li key={o.wallet.id}>
                  {o.wallet.name}: {formatMoney(o.spent)} spent of {formatMoney(o.budget)} budget
                </li>
              ))}
            </ul>
          </div>
        )}

        {underfunded.length > 0 && (
          <div className={`${cardClass} border-l-4 border-l-warning`}>
            <div className="flex items-center gap-2 text-warning mb-2">
              <AlertTriangle size={18} />
              <span className="text-sm font-medium">
                {underfunded.length} wallet{underfunded.length === 1 ? '' : 's'} need more funding
              </span>
            </div>
            <ul className="text-sm text-ink-soft space-y-1">
              {underfunded.map(u => (
                <li key={u.wallet.id}>
                  {u.wallet.name}: needs {formatMoney(u.shortfall)} more for upcoming payments
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Section 3 — This month's performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h2 className={`${sectionLabel} mb-4`}>This month's performance</h2>
          <div className="grid grid-cols-2 gap-6">
            <MetricCard
              label="Income" value={formatMoney(metrics.income)}
              current={metrics.income} avg={averages.income}
            />
            <MetricCard
              label="Spending" value={formatMoney(metrics.spending)}
              current={metrics.spending} avg={averages.spending} lowerIsBetter
            />
            <MetricCard
              label="Net" value={formatMoney(metrics.net)}
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

        <div className={cardClass}>
          <h2 className={`${sectionLabel} mb-4`}>Wallet progress</h2>
          {progressWallets.length === 0 ? (
            <p className="text-sm text-ink-muted">No wallets to show.</p>
          ) : (
            <div className="space-y-4">
              {progressWallets.map(w => {
                const budget = Number(w.budget)
                const pct    = budget > 0 ? (w.spent / budget) * 100 : 0
                const barColour = pct >= 100 ? 'bg-negative-bar' : pct >= 75 ? 'bg-warning' : 'bg-positive-bar'
                return (
                  <div key={w.id}>
                    <div className="flex items-center gap-2 text-sm mb-1">
                      <WalletIcon wallet={w} size={14} className="text-ink-soft flex-shrink-0" />
                      <span className="text-ink font-medium">{w.name}</span>
                    </div>
                    <div className="h-1.5 bg-track rounded-full overflow-hidden mb-1">
                      <div className={`h-full rounded-full ${barColour}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span>{formatMoney(w.spent)} spent of {formatMoney(budget)} budget</span>
                      {w.type === 'variable' && w.budget_type === 'accumulating' && (
                        <span className="text-ink-faint">Balance: {formatMoney(Number(w.balance))}</span>
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
          <h2 className={sectionLabel}>Over time</h2>
          {hasYearOfData && (
            <div className="flex gap-1 bg-track rounded-[9px] p-1">
              {[['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    viewMode === id
                      ? 'bg-card text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink'
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
        <div className="text-center py-16 text-ink-muted">
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
    const amount = unit === 'pp' ? `${Math.abs(diff).toFixed(1)}pp` : formatMoney(Math.abs(diff), { decimals: 0 })
    trend = (
      <span className={`text-[11px] font-medium ${good ? 'text-positive' : 'text-negative'}`}>
        {arrow} {amount}
      </span>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-ink-muted mb-1">{label}</p>
      <p className="text-xl font-medium text-ink">{value}</p>
      {trend}
    </div>
  )
}
