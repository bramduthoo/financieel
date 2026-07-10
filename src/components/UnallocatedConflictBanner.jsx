import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchPendingConflict, firePlan } from '../lib/unallocatedPlans'
import { formatMoney } from '../lib/format'

// Prominent banner + Review flow for a persisted multi-plan conflict (Stage 4d).
// Self-contained: queries the user's pending conflict, resolves the eligible plan ids to rows,
// and lets the user Apply one plan (fires it, marks resolved) or Dismiss (marks dismissed).
// Reused on the dashboard and the Unallocated page. `refreshSignal` re-queries on change;
// `onChange` is called after resolve/dismiss so the parent can refresh balances.
export default function UnallocatedConflictBanner({ refreshSignal, onChange }) {
  const [conflict,   setConflict]   = useState(null)
  const [plans,      setPlans]      = useState([])
  const [walletMap,  setWalletMap]  = useState({})
  const [unallocId,  setUnallocId]  = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [busy,       setBusy]       = useState(false)

  useEffect(() => { load() }, [refreshSignal])

  async function load() {
    const c = await fetchPendingConflict()
    setConflict(c)
    if (!c) { setPlans([]); return }

    const ids = c.eligible_plan_ids ?? []
    const [{ data: ua }, { data: ws }, { data: ps }] = await Promise.all([
      supabase.from('wallets').select('id').eq('is_system', true).single(),
      supabase.from('wallets').select('id, name'),
      ids.length
        ? supabase.from('unallocated_plans').select('*, unallocated_plan_items(*)').in('id', ids)
        : Promise.resolve({ data: [] }),
    ])
    setUnallocId(ua?.id ?? null)
    const wm = {}; (ws ?? []).forEach(w => { wm[w.id] = w.name })
    setWalletMap(wm)
    // Preserve the conflict's id order; silently skip ids that no longer resolve (deleted plans).
    const byId = {}; (ps ?? []).forEach(p => { byId[p.id] = p })
    setPlans(ids.map(id => byId[id]).filter(Boolean))
  }

  if (!conflict) return null

  const n = (conflict.eligible_plan_ids ?? []).length

  function walletName(id) { return walletMap[id] ?? '—' }
  function describe(p) {
    const thr = formatMoney(Number(p.threshold))
    const targets = (p.unallocated_plan_items ?? [])
      .map(i => `${walletName(i.wallet_id)} ${i.mode === 'percent' ? `${Number(i.value)}%` : formatMoney(Number(i.value))}`)
      .join(', ')
    if (p.distribute_mode === 'amount_over_threshold') return `Sweep everything above ${thr} → ${targets}`
    if (p.distribute_mode === 'fixed_amount')          return `When over ${thr}, distribute ${formatMoney(Number(p.distribute_amount))} → ${targets}`
    return `When over ${thr}, distribute the full balance → ${targets}`
  }

  async function applyPlan(plan) {
    if (busy) return
    setBusy(true)
    const { data: w } = await supabase.from('wallets').select('balance').eq('id', unallocId).single()
    const balance = w ? Number(w.balance) : 0
    await firePlan(unallocId, plan, balance)
    await supabase.from('unallocated_pending_conflicts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), chosen_plan_id: plan.id })
      .eq('id', conflict.id)
    setBusy(false)
    setReviewOpen(false)
    setConflict(null)
    onChange?.()
  }

  async function dismiss() {
    if (busy) return
    setBusy(true)
    await supabase.from('unallocated_pending_conflicts')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('id', conflict.id)
    setBusy(false)
    setReviewOpen(false)
    setConflict(null)
    onChange?.()
  }

  return (
    <>
      {/* Banner */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#854F0B]/25 bg-[#FAEEDA] dark:bg-[#854F0B]/15 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle size={18} className="text-[#854F0B] flex-shrink-0" />
          <p className="text-sm font-medium text-[#854F0B] truncate">
            {n} plans triggered at once. Choose which to apply.
          </p>
        </div>
        <button
          onClick={() => setReviewOpen(true)}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#854F0B] text-white text-sm font-medium hover:bg-[#6d4009] transition-colors"
        >
          Review
        </button>
      </div>

      {/* Review modal */}
      {reviewOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100 dark:border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Resolve plan conflict</h2>
              <button onClick={() => setReviewOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Multiple plans were eligible at the same time. Pick one to apply now, or dismiss them all.
              </p>
              {plans.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">None of the conflicting plans still exist.</p>
              ) : plans.map(p => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{describe(p)}</p>
                  </div>
                  <button
                    onClick={() => applyPlan(p)}
                    disabled={busy}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>

            <div className="px-6 pb-5 pt-3 border-t border-stone-100 dark:border-gray-800 flex-shrink-0 flex gap-3">
              <button
                onClick={dismiss}
                disabled={busy}
                className="flex-1 py-2 rounded-lg border border-stone-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Dismiss all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
