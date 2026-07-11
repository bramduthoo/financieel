import { useState } from 'react'
import { format, startOfDay, addDays, endOfMonth, endOfWeek } from 'date-fns'
import { Calendar, Table, CheckCircle2, XCircle } from 'lucide-react'
import { generatePaymentDates, generateUpcomingDates } from '../lib/recurringUtils'
import { formatMoney } from '../lib/format'

export default function UpcomingPayments({ rules, transactions = [] }) {
  const [view,      setView]      = useState('table')
  const [timeframe, setTimeframe] = useState('month')

  const today = startOfDay(new Date())

  const horizon = timeframe === 'week'
    ? endOfWeek(today, { weekStartsOn: 1 })
    : endOfMonth(today)

  // Table: upcoming payments within the selected timeframe
  const tableEvents = []
  for (const rule of rules) {
    const upcoming = generateUpcomingDates(rule, addDays(today, 1), 60)
    for (const date of upcoming) {
      if (date > horizon) break
      const dateStr = format(date, 'yyyy-MM-dd')
      tableEvents.push({ rule, date, dateStr })
    }
  }
  tableEvents.sort((a, b) => a.date - b.date)

  return (
    <div>
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-ink">Payments overview</h2>
        <div className="flex gap-1 bg-track rounded-lg p-1">
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${
              view === 'table'
                ? 'bg-card shadow-sm text-ink'
                : 'text-ink-faint hover:text-ink-soft dark:hover:text-ink'
            }`}
          >
            <Table size={14} />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded-md transition-colors ${
              view === 'calendar'
                ? 'bg-card shadow-sm text-ink'
                : 'text-ink-faint hover:text-ink-soft dark:hover:text-ink'
            }`}
          >
            <Calendar size={14} />
          </button>
        </div>
      </div>

      {/* Table view */}
      {view === 'table' && (
        <div>
          {/* Timeframe toggle */}
          <div className="flex items-center justify-end mb-2">
            <div className="flex gap-1 bg-track rounded-lg p-1">
              {[['week', 'This week'], ['month', 'This month']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTimeframe(id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeframe === id
                      ? 'bg-card shadow-sm text-ink'
                      : 'text-ink-muted hover:text-ink dark:hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tableEvents.length === 0 ? (
            <p className="text-xs text-ink-faint">
              No upcoming payments {timeframe === 'week' ? 'this week' : 'this month'}.
            </p>
          ) : (
            <div className="rounded-[14px] border border-card-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-track text-xs text-ink-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Payment</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inner-border">
                  {tableEvents.map((item, i) => (
                    <tr key={i} className="bg-card">
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {item.rule.name}
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">
                        {format(item.date, 'd MMM yyyy')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-ink">
                        {formatMoney(Number(item.rule.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Calendar view */}
      {view === 'calendar' && (
        <CalendarView
          rules={rules}
          transactions={transactions}
          today={today}
        />
      )}
    </div>
  )
}

function CalendarView({ rules, transactions, today }) {
  const [offset, setOffset] = useState(0)

  const viewDate  = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const year      = viewDate.getFullYear()
  const month     = viewDate.getMonth()
  const firstDay  = (new Date(year, month, 1).getDay() + 6) % 7
  const daysCount = new Date(year, month + 1, 0).getDate()
  const monthEnd  = startOfDay(new Date(year, month + 1, 0))

  // Build events for the currently viewed month
  const byDay = {}
  for (const rule of rules) {
    const allDates    = generatePaymentDates(rule, monthEnd)
    const futureDates = generateUpcomingDates(rule, addDays(today, 1), 60)
    const combined    = [
      ...allDates,
      ...futureDates.filter(d => d <= monthEnd),
    ]

    const seen = new Set()
    for (const date of combined) {
      if (date.getFullYear() !== year || date.getMonth() !== month) continue
      const dateStr = format(date, 'yyyy-MM-dd')
      if (seen.has(dateStr)) continue
      seen.add(dateStr)

      const tx        = transactions.find(
        t => t.recurring_rule_id === rule.id && t.date === dateStr
      )
      const confirmed = tx?.is_confirmed ?? false
      const isFuture  = date > today
      const d         = date.getDate()

      if (!byDay[d]) byDay[d] = []
      byDay[d].push({ rule, date, dateStr, confirmed, isFuture })
    }
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOffset(o => o - 1)}
          className="text-xs text-ink-muted hover:text-ink dark:hover:text-ink px-2 py-1 rounded hover:bg-track"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-ink">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setOffset(o => o + 1)}
          className="text-xs text-ink-muted hover:text-ink dark:hover:text-ink px-2 py-1 rounded hover:bg-track"
        >
          Next →
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-xs text-ink-faint mb-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />

          const isToday =
            day === today.getDate() &&
            viewDate.getMonth() === today.getMonth() &&
            viewDate.getFullYear() === today.getFullYear()

          const items = byDay[day] ?? []

          return (
            <div
              key={i}
              className={`min-h-16 p-1 rounded-lg border text-xs ${
                isToday
                  ? 'border-ink-faint bg-accent/10'
                  : 'border-inner-border bg-card'
              }`}
            >
              <p className={`text-center font-medium mb-1 ${
                isToday ? 'text-ink' : 'text-ink-soft'
              }`}>
                {day}
              </p>
              {items.map((item, j) => (
                <div
                  key={j}
                  className={`flex items-center gap-0.5 text-xs rounded px-1 py-0.5 mb-0.5 ${
                    item.isFuture
                      ? 'bg-track text-ink-soft'
                      : item.confirmed
                        ? 'bg-positive-tint text-positive'
                        : 'bg-negative-tint text-negative'
                  }`}
                  title={`${item.rule.name} — ${formatMoney(Number(item.rule.amount))}`}
                >
                  {!item.isFuture && (
                    item.confirmed
                      ? <CheckCircle2 size={10} className="flex-shrink-0" />
                      : <XCircle size={10} className="flex-shrink-0" />
                  )}
                  <span className="truncate">{item.rule.name}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
