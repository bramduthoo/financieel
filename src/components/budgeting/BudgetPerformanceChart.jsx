// Estimate-quality headline — the SECOND of Phase C's two questions (budgeting-phase-C.md §6.1/§6.6):
// "am I budgeting well?" Diverging deviation bars: the zero baseline IS the current budget total, each
// month's bar is (total spent − total budget) across all must-fund wallets. Over-budget rises in the
// `negative` token above the line, under-budget drops in `positive` below it.
//
// Honesty: labelled "vs current budget" (there is no budget history — §6.3.1); the partial current
// month is drawn lighter; months with no data at all draw no bar (a full-height "under" bar for an
// empty early month would be a lie, not a saving). Inline SVG only (DESIGN-SPEC §6); geometry computed
// here like IncomeSpendingChart. Every euro via formatMoney/formatMoneyCompact so privacy masks it.

import { formatMoney, formatMoneyCompact } from '../../lib/format'

const W = 720, H = 200
const MT = 14, MB = 26, ML = 52, MR = 16
const CW = W - ML - MR
const CH = H - MT - MB

export default function BudgetPerformanceChart({ performance = [] }) {
  const months = performance[0]?.perMonth ?? []
  const totalBudget = performance.reduce((s, p) => s + p.budget, 0)

  // Per-month aggregates across must-fund wallets. A completed month "has data" if the recurring
  // income was logged or anything was spent — otherwise it is pre-history, not a €0 month. The CURRENT
  // partial month only counts once something has actually been spent: a logged-but-unspent month is
  // early-in-the-month, not "under budget", so we don't draw an alarming full-height bar on day 3.
  const series = months.map((m, i) => {
    const spent = performance.reduce((s, p) => s + (p.perMonth[i]?.spent ?? 0), 0)
    const hasData = spent > 0.005 || (m.logged && !m.isCurrent)
    return { label: m.label, isCurrent: m.isCurrent, spent, deviation: spent - totalBudget, hasData }
  })

  const withData = series.filter(s => s.hasData)
  if (totalBudget <= 0 || withData.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-[14px] p-5">
        <Header />
        <p className="text-sm text-ink-faint py-10 text-center">Not enough spending history yet.</p>
      </div>
    )
  }

  const maxAbs = Math.max(1, ...withData.map(s => Math.abs(s.deviation)))
  const slotW = CW / series.length
  const barW = Math.min(38, slotW * 0.5)
  const zeroY = MT + CH / 2
  const scale = (CH / 2) / maxAbs
  const barX = i => ML + i * slotW + (slotW - barW) / 2

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <Header />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Spending vs current budget by month">
        {/* Faint over/under scale ticks */}
        {[maxAbs, 0, -maxAbs].map((v, i) => {
          const y = zeroY - v * scale
          return (
            <g key={i}>
              <line x1={ML} y1={y} x2={ML + CW} y2={y} className={v === 0 ? 'stroke-ink-faint' : 'stroke-track'} strokeWidth={1} strokeDasharray={v === 0 ? '4 3' : undefined} />
              <text x={ML - 8} y={y + 3} textAnchor="end" fontSize={10} className="fill-ink-faint">
                {v === 0 ? '€0' : (v > 0 ? '+' : '−') + formatMoneyCompact(Math.abs(v))}
              </text>
            </g>
          )
        })}

        {series.map((s, i) => {
          if (!s.hasData) {
            return (
              <text key={i} x={barX(i) + barW / 2} y={zeroY + 4} textAnchor="middle" fontSize={9} className="fill-ink-faint">·</text>
            )
          }
          const over = s.deviation > 0
          const h = Math.max(1, Math.abs(s.deviation) * scale)
          const y = over ? zeroY - h : zeroY
          const fill = over ? 'fill-negative-bar' : 'fill-positive-bar'
          return (
            <rect
              key={i}
              x={barX(i)} y={y} width={barW} height={h} rx={2}
              className={`${fill} ${s.isCurrent ? 'opacity-40' : ''}`}
            >
              <title>{`${s.label}: ${formatMoney(s.spent)} spent · ${over ? 'over' : 'under'} by ${formatMoney(Math.abs(s.deviation))}${s.isCurrent ? ' (so far)' : ''}`}</title>
            </rect>
          )
        })}

        {series.map((s, i) => (
          <text key={`x-${i}`} x={ML + i * slotW + slotW / 2} y={H - 8} textAnchor="middle" fontSize={10} className={s.isCurrent ? 'fill-ink-faint' : 'fill-ink-muted'}>
            {s.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-[11px] font-medium text-ink-muted uppercase tracking-wider">Spending vs current budget</h3>
      <div className="flex items-center gap-4 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-negative-bar" />Over</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-positive-bar" />Under</span>
      </div>
    </div>
  )
}
