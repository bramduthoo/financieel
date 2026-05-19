import { useState } from 'react'
import { format, startOfDay, addDays, isSameMonth, getDate } from 'date-fns'
import { Calendar, Table } from 'lucide-react'
import { generateUpcomingDates } from '../lib/recurringUtils'

export default function UpcomingPayments({ rules }) {
  const [view, setView] = useState('table') // 'table' | 'calendar'

  // Build upcoming items for next 30 days
  const today    = startOfDay(new Date())
  const horizon  = addDays(today, 30)
  const upcoming = []

  for (const rule of rules) {
    const dates = generateUpcomingDates(rule, today, 20)
    for (const date of dates) {
      if (date <= horizon) {
        upcoming.push({ rule, date })
      }
    }
  }
  upcoming.sort((a, b) => a.date - b.date)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Upcoming payments</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Table size={14} />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded-md transition-colors ${view === 'calendar' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Calendar size={14} />
          </button>
        </div>
      </div>

      {upcoming.length === 0 && (
        <p className="text-xs text-gray-400">No upcoming payments in the next 30 days.</p>
      )}

      {view === 'table' && upcoming.length > 0 && (
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
              {upcoming.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{item.rule.description}</td>
                  <td className="px-4 py-2.5 text-gray-500">{format(item.date, 'd MMM yyyy')}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-700">
                    €{Number(item.rule.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'calendar' && (
        <CalendarView upcoming={upcoming} today={today} />
      )}
    </div>
  )
}

function CalendarView({ upcoming, today }) {
  const [offset, setOffset] = useState(0)
  const viewDate  = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const year      = viewDate.getFullYear()
  const month     = viewDate.getMonth()
  const firstDay  = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const blanks    = (firstDay + 6) % 7 // shift so Monday = 0

  const byDay = {}
  for (const item of upcoming) {
    if (item.date.getFullYear() === year && item.date.getMonth() === month) {
      const d = item.date.getDate()
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(item)
    }
  }

  const cells = []
  for (let i = 0; i < blanks; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOffset(o => o - 1)}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
          ← Prev
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button onClick={() => setOffset(o => o + 1)}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
          Next →
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const isToday = day === today.getDate() && offset === 0
          const items   = byDay[day] ?? []
          return (
            <div key={i}
              className={`min-h-14 p-1 rounded-lg border text-xs ${
                isToday ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white'
              }`}
            >
              <p className={`text-center font-medium mb-1 ${isToday ? 'text-indigo-600' : 'text-gray-600'}`}>
                {day}
              </p>
              {items.map((item, j) => (
                <div key={j}
                  className="text-xs bg-orange-100 text-orange-700 rounded px-1 py-0.5 mb-0.5 truncate"
                  title={`${item.rule.description} — €${item.rule.amount}`}
                >
                  €{Number(item.rule.amount).toFixed(0)}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}