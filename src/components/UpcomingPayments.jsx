import { useState } from 'react'
import { format, startOfDay, addDays, endOfMonth, endOfWeek } from 'date-fns'
import { Calendar, Table, CheckCircle2, XCircle } from 'lucide-react'
import { generatePaymentDates, generateUpcomingDates } from '../lib/recurringUtils'

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
        <h2 className="text-sm font-semibold text-gray-700">Payments overview</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${
              view === 'table'
                ? 'bg-white shadow-sm text-indigo-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Table size={14} />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded-md transition-colors ${
              view === 'calendar'
                ? 'bg-white shadow-sm text-indigo-600'
                : 'text-gray-400 hover:text-gray-600'
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
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[['week', 'This week'], ['month', 'This month']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTimeframe(id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeframe === id
                      ? 'bg-white shadow-sm text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tableEvents.length === 0 ? (
            <p className="text-xs text-gray-400">
              No upcoming payments {timeframe === 'week' ? 'this week' : 'this month'}.
            </p>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Payment</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableEvents.map((item, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {item.rule.name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {format(item.date, 'd MMM yyyy')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-700">
                        €{Number(item.rule.amount).toFixed(2)}
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
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          ← Prev
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setOffset(o => o + 1)}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          Next →
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
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
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <p className={`text-center font-medium mb-1 ${
                isToday ? 'text-indigo-600' : 'text-gray-600'
              }`}>
                {day}
              </p>
              {items.map((item, j) => (
                <div
                  key={j}
                  className={`flex items-center gap-0.5 text-xs rounded px-1 py-0.5 mb-0.5 ${
                    item.isFuture
                      ? 'bg-blue-100 text-blue-700'
                      : item.confirmed
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                  }`}
                  title={`${item.rule.name} — €${Number(item.rule.amount).toFixed(2)}`}
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
