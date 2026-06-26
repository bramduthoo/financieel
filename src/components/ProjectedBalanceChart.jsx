import { format } from 'date-fns'

const W = 460, H = 200
const X0 = 35, X1 = 455
const Y0 = 30, Y1 = 160
const CW = X1 - X0
const CH = Y1 - Y0

function niceStep(range) {
  if (range <= 4000) return 500
  return 1000
}

function fmtY(val) {
  if (val === 0) return '€0'
  const sign = val < 0 ? '−' : ''
  const abs = Math.abs(val)
  return abs >= 1000 ? `${sign}€${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k` : `${sign}€${abs}`
}

function fmtAmount(amount, type) {
  return type === 'income' ? `+€${amount.toFixed(2)}` : `−€${amount.toFixed(2)}`
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
              <span className="text-gray-600">{e.name}</span>{' '}
              <span className="text-[#3B6D11] font-medium">{fmtAmount(e.amount, e.type)}</span>{' '}
              <span className="text-gray-400">{format(e.date, 'dd/MM')}</span>
            </div>
          ))}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={X0} y1={py(tick)} x2={X1} y2={py(tick)}
              stroke={tick === 0 ? '#444441' : '#e7e5e4'}
              strokeWidth={1}
              strokeDasharray={tick === 0 ? '3 3' : undefined}
            />
            <text x={X0 - 6} y={py(tick) + 3} textAnchor="end" fontSize={9} fill="#a8a29e">
              {fmtY(tick)}
            </text>
          </g>
        ))}

        <path d={greenFill} fill="#97C459" fillOpacity={0.28} />
        <path d={redFill} fill="#F09595" fillOpacity={0.22} />
        <path d={linePath} fill="none" stroke="#444441" strokeWidth={1.5} />

        {events.map((e, i) => {
          const p = points[2 * i + 2]
          return (
            <circle
              key={i}
              cx={p.x} cy={p.y} r={3}
              fill={e.type === 'cost' ? '#A32D2D' : '#3B6D11'}
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
              <span className="text-gray-600">{e.name}</span>{' '}
              <span className="text-[#A32D2D] font-medium">{fmtAmount(e.amount, e.type)}</span>{' '}
              <span className="text-gray-400">{format(e.date, 'dd/MM')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
