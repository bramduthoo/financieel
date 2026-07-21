// Multi-income distribution editor (budgeting-page-plan.md §12.5). One card per included income;
// each row is a wallet with a €/% toggle, an amount, a "fund to budget" action, and a funding bar
// AGGREGATED ACROSS ALL INCOMES — so a wallet fully funded by one income reads 100% in every
// income's row, and one fed 40/60 by two reads 100% in both.
//
// All euro/percent maths goes through resolveDistribution() — the tested canonical resolver shared
// with DistributionPopup. This file never does its own euro/percent arithmetic.
// Percentages are of THAT income's amount (the app-wide "% is always of the total input" rule).

import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { computeWalletFunding, fundToBudget, isMustFund, resolveIncomeEdit } from '../../lib/budgetPlan'
import { formatMoney } from '../../lib/format'
import { WalletIcon } from '../../lib/walletIcons'
import MetricBar from '../ui/MetricBar'

const round2 = n => Number(Number(n).toFixed(2))

// Segmented €/% pill — same shape as DistributionPopup's ModePill (DESIGN-SPEC §4).
function ModePill({ mode, onChange }) {
  return (
    <div className="inline-flex bg-track rounded-[8px] p-0.5 shrink-0">
      {['euro', 'percent'].map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
            mode === m ? 'bg-ink text-cream shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {m === 'euro' ? '€' : '%'}
        </button>
      ))}
    </div>
  )
}

// edits: { [incomeId]: { [walletId]: { mode, value } } }
export default function DistributionEditor({
  incomes = [],
  wallets = [],
  editableWallets = [],
  unallocatedWalletId = null,
  edits = {},
  onChange,          // (incomeId, walletId, { mode, value }) => void
  onCancel,
  onSave,
  busy = false,
}) {
  // Resolve every income once: the same numbers drive each income's footer AND the shared
  // per-wallet funding bars, so the two can never disagree.
  const resolvedByIncome = useMemo(() => {
    const out = {}
    for (const inc of incomes) {
      out[inc.id] = resolveIncomeEdit({
        income: inc, editableWallets, edits: edits[inc.id] ?? {}, unallocatedWalletId,
      })
    }
    return out
  }, [incomes, editableWallets, edits, unallocatedWalletId])

  // Flat allocation list across every income — the input to both the funding bars and fundToBudget.
  const allocations = useMemo(
    () => incomes.flatMap(inc =>
      (resolvedByIncome[inc.id]?.explicit ?? []).map(r => ({
        income_id: inc.id, wallet_id: r.wallet_id, amount: r.amount,
      }))),
    [incomes, resolvedByIncome],
  )

  const { fundedByWallet } = useMemo(
    () => computeWalletFunding({ wallets, allocations }),
    [wallets, allocations],
  )

  const anyOver = incomes.some(inc => !resolvedByIncome[inc.id]?.notOver)

  function handleFundToBudget(inc, wallet) {
    const amount = fundToBudget({
      wallet,
      incomeId: inc.id,
      incomeAmount: Number(inc.amount) || 0,
      allocations,
    })
    onChange(inc.id, wallet.id, { mode: 'euro', value: amount > 0 ? String(amount) : '' })
  }

  return (
    <div className="space-y-6">
      {incomes.map(inc => {
        const resolved  = resolvedByIncome[inc.id]
        const remainder = resolved.remainder
        const over      = !resolved.notOver

        return (
          <div key={inc.id} className="bg-card border border-card-border rounded-[14px] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-ink">{inc.name}</h2>
              <span className="text-sm font-medium text-ink tracking-tight">{formatMoney(inc.amount)}</span>
            </div>

            <div className="divide-y divide-inner-border">
              {editableWallets.map(w => {
                const row     = edits[inc.id]?.[w.id] ?? { mode: 'euro', value: '' }
                const budget  = Number(w.budget) || 0
                const funded  = fundedByWallet[w.id] ?? 0
                const mustFund = isMustFund(w)
                const pct     = budget > 0 ? (funded / budget) * 100 : 0
                const overFunded = budget > 0 && funded > budget + 0.005

                return (
                  <div key={w.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <WalletIcon wallet={w} size={14} className="text-ink-soft shrink-0" />
                        <span className="text-sm text-ink truncate">{w.name}</span>
                      </div>

                      <ModePill
                        mode={row.mode}
                        onChange={mode => onChange(inc.id, w.id, { ...row, mode })}
                      />

                      <input
                        type="number" min="0" step="0.01"
                        value={row.value}
                        onChange={e => onChange(inc.id, w.id, { ...row, value: e.target.value })}
                        placeholder={row.mode === 'euro' ? '0.00' : '0'}
                        aria-label={`${w.name} allocation from ${inc.name}`}
                        className="w-24 px-2 py-1.5 text-sm text-right bg-field border border-card-border rounded-[8px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 shrink-0"
                      />

                      {mustFund && budget > 0 && (
                        <button
                          type="button"
                          onClick={() => handleFundToBudget(inc, w)}
                          title="Fill this wallet's remaining shortfall from this income"
                          className="text-[11px] text-ink-muted hover:text-ink whitespace-nowrap shrink-0 px-1.5 py-1 rounded-[6px] hover:bg-track focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 transition-colors"
                        >
                          fund to budget
                        </button>
                      )}
                    </div>

                    {/* Funding across ALL included incomes — identical in every income's row. */}
                    {mustFund && budget > 0 && (
                      <div className="mt-1.5 pl-[22px]">
                        <MetricBar
                          value={Math.min(funded, budget)} max={budget}
                          fillClass={overFunded ? 'bg-warning' : pct >= 99.995 ? 'bg-positive-bar' : 'bg-accent-solid'}
                        />
                        <p className="text-[11px] text-ink-muted mt-1">
                          {overFunded
                            ? <span className="text-warning">over by {formatMoney(funded - budget)}</span>
                            : `${formatMoney(funded)} of ${formatMoney(budget)} funded`}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between mt-3 text-[11px]">
              <span className="text-ink-muted">{over ? 'Over-distributed' : 'To Unallocated'}</span>
              <span className={`tracking-tight font-medium ${over ? 'text-negative' : 'text-ink-soft'}`}>
                {over
                  ? `−${formatMoney(Math.abs(round2(Number(inc.amount) - resolved.distributed)))}`
                  : formatMoney(remainder)}
              </span>
            </div>
          </div>
        )
      })}

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={busy || anyOver}
          className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Check size={15} /> {busy ? 'Saving…' : 'Save plan'}
        </button>
      </div>
    </div>
  )
}
