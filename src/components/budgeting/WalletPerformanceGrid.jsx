// Per-wallet detail on demand (budgeting-phase-C.md §6.6). A small-multiples grid of compact
// spent-vs-budget mini charts, one per must-fund wallet — NOT rendered for every wallet by default.
// Owner's chosen shape: default to the first ~5 wallets, with a dropdown to choose which are visible.
//
// Per-month bars are spent, coloured under/over the budget reference line. For CAPPED wallets the
// realized (throttled) inflow is drawn as a faint underlay so a cap throttle is never misread as
// underfunding (§6.4). Inline SVG only; every euro via formatMoney so privacy mode masks it.

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { WalletIcon } from '../../lib/walletIcons'
import { formatMoney } from '../../lib/format'

const DEFAULT_VISIBLE = 5

export default function WalletPerformanceGrid({ performance = [] }) {
  const [selected, setSelected] = useState(() => new Set(performance.slice(0, DEFAULT_VISIBLE).map(p => p.wallet.id)))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (performance.length === 0) return null

  const toggle = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const shown = performance.filter(p => selected.has(p.wallet.id))

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-medium text-ink-muted uppercase tracking-wider">Per-wallet detail</h3>

        {/* Multi-select dropdown — which wallets are visible */}
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-ink-soft border border-card-border rounded-[9px] hover:bg-track transition-colors"
          >
            {shown.length} of {performance.length}
            <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {open && (
            <div className="absolute right-0 mt-1 z-10 w-52 max-h-64 overflow-auto bg-card border border-card-border rounded-[11px] p-1 shadow-sm">
              {performance.map(p => {
                const on = selected.has(p.wallet.id)
                return (
                  <button
                    key={p.wallet.id}
                    type="button"
                    onClick={() => toggle(p.wallet.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-ink text-left rounded-[8px] hover:bg-track transition-colors"
                  >
                    <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 ${on ? 'bg-accent-solid border-accent-solid' : 'border-card-border'}`}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    <WalletIcon wallet={p.wallet} size={13} className="text-ink-muted shrink-0" />
                    <span className="truncate">{p.wallet.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-faint py-8 text-center">No wallets selected.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map(p => <MiniChart key={p.wallet.id} perf={p} />)}
        </div>
      )}
    </div>
  )
}

const W = 200, H = 96
const MT = 8, MB = 18, ML = 6, MR = 6
const CW = W - ML - MR
const CH = H - MT - MB

function MiniChart({ perf }) {
  const { wallet, budget, perMonth } = perf
  const capped = wallet.budget_type === 'capped'
  const maxVal = Math.max(budget, ...perMonth.map(m => Math.max(m.spent, m.received ?? 0)), 1) * 1.1
  const slotW = CW / perMonth.length
  const barW = Math.min(20, slotW * 0.55)
  const h = v => (v / maxVal) * CH
  const y = v => MT + CH - h(v)
  const budgetY = y(budget)

  return (
    <div className="rounded-[11px] border border-inner-border p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <WalletIcon wallet={wallet} size={12} className="text-ink-muted shrink-0" />
          <span className="text-[13px] text-ink truncate">{wallet.name}</span>
        </div>
        <span className="text-[11px] text-ink-muted tracking-tight shrink-0">{formatMoney(budget)}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${wallet.name} spending by month vs budget`}>
        {perMonth.map((m, i) => {
          const x = ML + i * slotW + (slotW - barW) / 2
          const over = m.spent > budget + 0.005
          return (
            <g key={i}>
              {/* Realized inflow underlay for capped wallets (throttle ≠ underspend) */}
              {capped && m.received != null && m.received > 0 && (
                <rect x={x - 2} y={y(m.received)} width={barW + 4} height={h(m.received)} rx={2} className="fill-track" />
              )}
              {m.spent > 0 && (
                <rect x={x} y={y(m.spent)} width={barW} height={h(m.spent)} rx={2} className={`${over ? 'fill-negative-bar' : 'fill-positive-bar'} ${m.isCurrent ? 'opacity-40' : ''}`}>
                  <title>{`${m.label}: ${formatMoney(m.spent)} spent${capped && m.received != null ? ` · ${formatMoney(m.received)} received` : ''}`}</title>
                </rect>
              )}
              <text x={ML + i * slotW + slotW / 2} y={H - 6} textAnchor="middle" fontSize={8} className="fill-ink-faint">{m.label}</text>
            </g>
          )
        })}
        {/* Budget reference line */}
        <line x1={ML} y1={budgetY} x2={ML + CW} y2={budgetY} className="stroke-ink-faint" strokeWidth={1} strokeDasharray="3 2" />
      </svg>
    </div>
  )
}
