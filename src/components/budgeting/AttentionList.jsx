// The nudge surface (budgeting-phase-C.md §6.5/§6.6). Renders ONLY wallets detectBudgetDrift flagged —
// never a row per wallet. Each flag shows the trailing average, the current budget, a suggested budget
// (= the trailing average), direction-aware copy, and a button into the existing wallet edit modal
// with the budget field focused. It SUGGESTS ONLY — it never writes the budget.
//
// Empty states are deliberately different: with wallets evaluated but none drifting, the emptiness is a
// GOOD result and is worded as one. With nothing evaluable yet (sparse history) the whole card hides —
// the chart already carries the "not enough data" story, and a false "all good" would be dishonest.

import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { WalletIcon } from '../../lib/walletIcons'
import { formatMoney } from '../../lib/format'

export default function AttentionList({ flagged = [], evaluatedCount = 0, onEdit }) {
  if (evaluatedCount === 0) return null

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <h3 className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-3">Budget suggestions</h3>

      {flagged.length === 0 ? (
        <p className="text-sm text-ink-muted py-4 text-center">
          Every budget matches how it's being spent. Nothing to adjust.
        </p>
      ) : (
        <div className="divide-y divide-inner-border">
          {flagged.map(f => {
            const over = f.direction === 'over'
            return (
              <div key={f.wallet.id} className="flex items-center gap-3 py-3">
                <span className={`shrink-0 ${over ? 'text-negative' : 'text-positive'}`}>
                  {over ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <WalletIcon wallet={f.wallet} size={13} className="text-ink-muted shrink-0" />
                    <span className="text-sm text-ink truncate">{f.wallet.name}</span>
                  </div>
                  <p className="text-[12px] text-ink-muted">
                    {over
                      ? <>Spending {formatMoney(f.trailingAvg)}/mo — budget of {formatMoney(f.currentBudget)} looks too low.</>
                      : <>Spending {formatMoney(f.trailingAvg)}/mo — budget of {formatMoney(f.currentBudget)} ties up money that could go to the free pool.</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit?.(f.wallet)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
                >
                  <span className="text-ink font-medium tracking-tight">{formatMoney(f.suggestedBudget)}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
