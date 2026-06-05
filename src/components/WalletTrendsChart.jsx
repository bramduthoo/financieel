import { useEffect, useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { supabase } from '../lib/supabase'

// SVG layout
const W = 560, H = 210
const MT = 15, MR = 15, MB = 40, ML = 54
const CW = W - ML - MR
const CH = H - MT - MB

function niceMax(val) {
  if (val <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  return Math.ceil(val / mag) * mag
}

function fmtY(val) {
  if (val >= 1000) return `€${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
  return `€${Math.round(val)}`
}

export default function WalletTrendsChart({ walletId }) {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { fetchAll() }, [walletId])

  async function fetchAll() {
    setLoading(true)
    const from = format(subMonths(startOfMonth(new Date()), 5), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('transactions')
      .select('amount, type, date')
      .eq('wallet_id', walletId)
      .gte('date', from)
      .order('date', { ascending: true })
    setTransactions(data ?? [])
    setLoading(false)
  }

  const chartData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) =>
      subMonths(startOfMonth(new Date()), 5 - i)
    )
    return months.map(m => {
      const from   = format(startOfMonth(m), 'yyyy-MM-dd')
      const to     = format(endOfMonth(m),   'yyyy-MM-dd')
      const mtxns  = transactions.filter(t => t.date >= from && t.date <= to)
      const debit  = mtxns.filter(t => t.type === 'debit').reduce((s, t)  => s + Number(t.amount), 0)
      const credit = mtxns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0)
      return { month: format(m, 'MMM yy'), debit, credit }
    })
  }, [transactions])

  const maxVal  = niceMax(Math.max(...chartData.flatMap(d => [d.debit, d.credit]), 0))
  const ticks   = Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i))

  const slotW  = CW / chartData.length
  const groupW = slotW * 0.58
  const barW   = (groupW - 3) / 2

  function bH(val)       { return (val / maxVal) * CH }
  function bY(val)       { return MT + CH - bH(val) }
  function bX(i, side)   {
    const gx = ML + i * slotW + (slotW - groupW) / 2
    return side === 0 ? gx : gx + barW + 3
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-400">Loading chart…</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Monthly activity</h2>
          <p className="text-xs text-gray-400 mt-0.5">Last 6 months</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-400" />
            Spent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-400" />
            Credit
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {/* Y axis gridlines + labels */}
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={ML}      y1={bY(tick)}
              x2={ML + CW} y2={bY(tick)}
              stroke={i === 0 ? '#e5e7eb' : '#f3f4f6'}
              strokeWidth={1}
            />
            <text
              x={ML - 6} y={bY(tick) + 4}
              textAnchor="end"
              fontSize={10} fill="#9ca3af"
            >
              {fmtY(tick)}
            </text>
          </g>
        ))}

        {/* Bars + X axis labels */}
        {chartData.map((d, i) => (
          <g key={i}>
            {d.debit > 0 && (
              <rect
                x={bX(i, 0)} y={bY(d.debit)}
                width={barW}  height={bH(d.debit)}
                fill="#f87171" rx={2}
              >
                <title>{d.month} · Spent: €{d.debit.toFixed(2)}</title>
              </rect>
            )}
            {d.credit > 0 && (
              <rect
                x={bX(i, 1)} y={bY(d.credit)}
                width={barW}  height={bH(d.credit)}
                fill="#4ade80" rx={2}
              >
                <title>{d.month} · Credit: €{d.credit.toFixed(2)}</title>
              </rect>
            )}
            <text
              x={ML + i * slotW + slotW / 2}
              y={MT + CH + 18}
              textAnchor="middle"
              fontSize={10} fill="#9ca3af"
            >
              {d.month}
            </text>
          </g>
        ))}

        {/* X axis baseline */}
        <line
          x1={ML} y1={MT + CH}
          x2={ML + CW} y2={MT + CH}
          stroke="#e5e7eb" strokeWidth={1}
        />
      </svg>
    </div>
  )
}
