import { formatMoney } from '../lib/format'

// SVG layout
const W = 720, H = 240
const MT = 15, MR = 15, MB = 30, ML = 60
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

export default function IncomeSpendingChart({ data }) {
  const maxVal = niceMax(Math.max(...data.flatMap(d => [d.income, d.spending]), 0))
  const ticks  = Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i))

  const slotW  = CW / data.length
  const groupW = slotW * 0.6
  const barW   = (groupW - 3) / 2

  function bH(val)     { return (val / maxVal) * CH }
  function bY(val)     { return MT + CH - bH(val) }
  function bX(i, side) {
    const gx = ML + i * slotW + (slotW - groupW) / 2
    return side === 0 ? gx : gx + barW + 3
  }

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-6">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-[11px] font-medium text-ink-muted uppercase tracking-wider">Income vs spending</h3>
        <div className="flex items-center gap-4 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-positive-bar" />
            Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-negative-bar" />
            Spending
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={ML} y1={bY(tick)} x2={ML + CW} y2={bY(tick)}
              className={i === 0 ? 'stroke-ink-faint' : 'stroke-track'} strokeWidth={1}
            />
            <text x={ML - 8} y={bY(tick) + 4} textAnchor="end" fontSize={10} className="fill-ink-faint">
              {fmtY(tick)}
            </text>
          </g>
        ))}

        {data.map((d, i) => (
          <g key={i}>
            {d.income > 0 && (
              <rect
                x={bX(i, 0)} y={bY(d.income)} width={barW} height={bH(d.income)}
                className="fill-positive-bar" rx={2}
              >
                <title>{d.label} · Income: {formatMoney(d.income)}</title>
              </rect>
            )}
            {d.spending > 0 && (
              <rect
                x={bX(i, 1)} y={bY(d.spending)} width={barW} height={bH(d.spending)}
                className="fill-negative-bar" rx={2}
              >
                <title>{d.label} · Spending: {formatMoney(d.spending)}</title>
              </rect>
            )}
            <text
              x={ML + i * slotW + slotW / 2} y={MT + CH + 18}
              textAnchor="middle" fontSize={10} className="fill-ink-faint"
            >
              {d.label}
            </text>
          </g>
        ))}

        <line x1={ML} y1={MT + CH} x2={ML + CW} y2={MT + CH} className="stroke-ink-faint" strokeWidth={1} />
      </svg>
    </div>
  )
}
