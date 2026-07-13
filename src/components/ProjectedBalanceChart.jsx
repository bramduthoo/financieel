import { format } from 'date-fns'
import { formatMoney, formatMoneyCompact } from '../lib/format'

const W = 460, H = 200
const X0 = 35, X1 = 455
const Y0 = 30, Y1 = 160
const CW = X1 - X0
const CH = Y1 - Y0

function niceStep(range) {
  if (range <= 4000) return 500
  return 1000
}

const fmtY = formatMoneyCompact

function fmtAmount(amount, type) {
  return type === 'income' ? `+${formatMoney(amount)}` : `−${formatMoney(amount)}`
}

export default function ProjectedBalanceChart({ timeline }) {
  const { events, startBalance, minBalance, maxBalance } = timeline

  const step = niceStep(maxBalance - minBalance)
  const yMax = Math.ceil(maxBalance / step) * step
  const yMin = Math.floor(minBalance / step) * step
  const range = (yMax - yMin) || 1

  const ticks = []
  for (let v = yMax; v >= yMin; v -= step) ticks.push(v)

  function py(val) { return Y0 + CH - ((val - yMin) / range) * CH }
  const zeroY = py(0)

  const points = [{ x: X0, y: py(startBalance) }]
  events.forEach((e, i) => {
    const x = X0 + ((i + 1) / events.length) * CW
    points.push({ x, y: points[points.length - 1].y })
    points.push({ x, y: py(e.balanceAfter) })
  })
  if (events.length === 0) {
    points.push({ x: X1, y: py(startBalance) })
  } else {
    points[points.length - 1] = { ...points[points.length - 1], x: X1 }
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  const greenFill = `${linePath} L ${points[points.length - 1].x} ${zeroY} ` +
    points.slice().reverse().map(p => `L ${p.x} ${Math.min(p.y, zeroY)}`).join(' ') + ' Z'
  const redFill = `${linePath} L ${points[points.length - 1].x} ${zeroY} ` +
    points.slice().reverse().map(p => `L ${p.x} ${Math.max(p.y, zeroY)}`).join(' ') + ' Z'

  const incomeEvents = events.filter(e => e.type === 'income')
  const costEvents   = events.filter(e => e.type === 'cost')

  return (
    <div>
      {incomeEvents.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-1">
          {incomeEvents.map((e, i) => (
            <div key={i} className="text-[11px] leading-tight">
              <span className="text-ink-soft">{e.name}</span>{' '}
              <span className="text-positive font-medium">{fmtAmount(e.amount, e.type)}</span>{' '}
              <span className="text-ink-muted">{format(e.date, 'dd/MM')}</span>
            </div>
          ))}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={X0} y1={py(tick)} x2={X1} y2={py(tick)}
              className={tick === 0 ? 'stroke-ink-faint' : 'stroke-track'}
              strokeWidth={1}
              strokeDasharray={tick === 0 ? '3 3' : undefined}
            />
            <text x={X0 - 6} y={py(tick) + 3} textAnchor="end" fontSize={9} className="fill-ink-faint">
              {fmtY(tick)}
            </text>
          </g>
        ))}

        <path d={greenFill} className="fill-positive-bar" fillOpacity={0.22} />
        <path d={redFill} className="fill-negative-bar" fillOpacity={0.18} />
        <path d={linePath} fill="none" className="stroke-ink" strokeWidth={1.5} />

        {events.map((e, i) => {
          const p = points[2 * i + 2]
          return (
            <circle
              key={i}
              cx={p.x} cy={p.y} r={3}
              className={e.type === 'cost' ? 'fill-negative-bar' : 'fill-positive-bar'}
            >
              <title>{e.name} · {fmtAmount(e.amount, e.type)} · {format(e.date, 'dd/MM')}</title>
            </circle>
          )
        })}
      </svg>

      {costEvents.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {costEvents.map((e, i) => (
            <div key={i} className="text-[11px] leading-tight">
              <span className="text-ink-soft">{e.name}</span>{' '}
              <span className="text-negative font-medium">{fmtAmount(e.amount, e.type)}</span>{' '}
              <span className="text-ink-muted">{format(e.date, 'dd/MM')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
