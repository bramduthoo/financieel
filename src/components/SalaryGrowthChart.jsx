import { format, parseISO } from 'date-fns'
import { formatMoney } from '../lib/format'

export default function SalaryGrowthChart({ chain }) {
  if (!chain || chain.length < 2) return null

  const W = 220, H = 52, PAD = 8

  const amounts = chain.map(r => Number(r.amount))
  const minA = Math.min(...amounts)
  const maxA = Math.max(...amounts)
  const range = maxA - minA || 1

  const timestamps = chain.map(r => new Date(r.start_date).getTime())
  const minT = Math.min(...timestamps)
  const maxT = Math.max(...timestamps)
  const timeRange = maxT - minT || 1

  const toX = t => PAD + ((t - minT) / timeRange) * (W - PAD * 2)
  const toY = a => (H - PAD) - ((a - minA) / range) * (H - PAD * 2)

  // Step-line: horizontal segment from version start to next version start
  let pathD = ''
  chain.forEach((r, i) => {
    const x1 = toX(new Date(r.start_date).getTime())
    const y  = toY(r.amount)
    const x2 = i < chain.length - 1
      ? toX(new Date(chain[i + 1].start_date).getTime())
      : W - PAD
    if (i === 0) pathD += `M ${x1} ${y} L ${x2} ${y}`
    else         pathD += ` L ${x1} ${y} L ${x2} ${y}`
  })

  const dots = chain.map(r => ({
    x: toX(new Date(r.start_date).getTime()),
    y: toY(r.amount),
    label: `${formatMoney(Number(r.amount), { decimals: 0 })} · from ${format(parseISO(r.start_date), 'd MMM yyyy')}`,
  }))

  return (
    <div className="mt-3 pt-3 border-t border-inner-border">
      <p className="text-xs text-ink-muted mb-1.5">Amount history</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
        <path d={pathD} fill="none" className="stroke-positive-bar" strokeWidth="1.5" strokeLinejoin="round" />
        {dots.map((d, i) => (
          <g key={i}>
            <title>{d.label}</title>
            <circle cx={d.x} cy={d.y} r={3} className="fill-positive-bar" />
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-ink-muted">
        <span>{formatMoney(Number(chain[0].amount), { decimals: 0 })}</span>
        <span>{formatMoney(Number(chain[chain.length - 1].amount), { decimals: 0 })}</span>
      </div>
    </div>
  )
}
