import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { resolveDistribution } from '../lib/resolveDistribution'
import { formatMoney } from '../lib/format'

const round2  = n => Number(Number(n).toFixed(2))
const fmtEur  = n => formatMoney(n)
const fmtPct  = n => `${Number(round2(n))}`   // trims trailing zeros for display

// Groups shown in order; Unallocated always last in its own group.
const GROUPS = [
  { key: 'fixed',       label: 'Fixed wallets',      match: w => w.type === 'fixed'      && !w.is_system },
  { key: 'variable',    label: 'Variable wallets',   match: w => w.type === 'variable'   && !w.is_system },
  { key: 'investment',  label: 'Investment wallets', match: w => w.type === 'investment' && !w.is_system },
  { key: 'unallocated', label: 'Unallocated',        match: w => w.is_system },
]

function budgetHint(w) {
  // Show budget only where it is meaningful: capped + fixed wallets with a non-zero budget.
  if ((w.type === 'fixed' || w.budget_type === 'capped') && Number(w.budget) > 0) {
    return fmtEur(w.budget)
  }
  return null
}

export default function DistributionPopup({ totalAmount, onConfirm, onClose, strictMode, existingRules = [], allowTemplates = false, initialSendRemainder, entryName, entryNote, onSaved, outbound = false, maxAmount = 0, initialAmount }) {
  const [wallets, setWallets]             = useState([])
  const [rows, setRows]                   = useState({})   // { [wallet_id]: { value: string, mode: 'euro'|'percent' } }
  const [globalMode, setGlobalMode]       = useState('euro')
  const [sendRemainder, setSendRemainder] = useState(false)
  const [unallocatedId, setUnallocatedId] = useState(null)
  const [loading, setLoading]             = useState(true)

  // Outbound mode (distributing OUT of Unallocated): the total is a user-chosen amount,
  // capped at maxAmount. In income mode this state is unused and `total` === `totalAmount`.
  const [outboundAmount, setOutboundAmount] = useState(initialAmount != null ? String(initialAmount) : '')

  // "Save as template" — quick manual income path only (saves a full income template)
  const [saving, setSaving]     = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => { fetchWallets() }, [])

  async function saveTemplate() {
    const name = saveName.trim()
    if (!name) return
    const userId = await getCurrentUserId()
    const { data: tpl } = await supabase
      .from('income_templates')
      .insert({ name, amount: totalAmount, note: entryNote ?? null, send_remainder: sendRemainder, user_id: userId })
      .select()
      .single()
    if (tpl) {
      const items = wallets
        .filter(w => Number(rows[w.id]?.value || 0) > 0)
        .map(w => ({
          income_template_id: tpl.id,
          wallet_id: w.id,
          mode: rows[w.id].mode,
          value: round2(rows[w.id].value),   // stored as entered — percent stays percent
          user_id: userId,
        }))
      if (items.length > 0) await supabase.from('income_template_distribution_items').insert(items)
    }
    setSaving(false)
    setSaveName('')
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2500)
    if (onSaved) onSaved()
  }

  async function fetchWallets() {
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    const ws = data ?? []
    setWallets(ws)

    const ua = ws.find(w => w.is_system)
    setUnallocatedId(ua?.id ?? null)

    const init = {}
    for (const rule of existingRules) {
      const mode  = rule.mode === 'percent' ? 'percent' : 'euro'
      const value = rule.value ?? rule.amount
      if (Number(value) > 0) init[rule.wallet_id] = { value: String(value), mode }
    }
    setRows(init)

    // If every existing rule is a percentage, surface the global toggle as %.
    if (existingRules.length > 0 && existingRules.every(r => r.mode === 'percent')) {
      setGlobalMode('percent')
    }

    // Outbound mode never sweeps a remainder back into Unallocated (we're moving money OUT).
    // Otherwise: honour a seeded flag (e.g. applying a saved template), else default for
    // non-strict manual entry.
    if (outbound) {
      setSendRemainder(false)
    } else if (initialSendRemainder !== undefined && initialSendRemainder !== null) {
      setSendRemainder(!!initialSendRemainder)
    } else {
      setSendRemainder(!strictMode && !!ua)
    }
    setLoading(false)
  }

  // Effective total to distribute against: a user-chosen amount in outbound mode,
  // otherwise the fixed income amount.
  const total = outbound ? (Number(outboundAmount) || 0) : totalAmount
  // Target wallets: in outbound mode the Unallocated wallet itself is never a target.
  const listWallets = outbound ? wallets.filter(w => !w.is_system) : wallets

  // Single call into the pure resolver drives the live totals, gating, and the confirm payload.
  const ordered = listWallets.map(w => ({ wallet_id: w.id, ...(rows[w.id] ?? {}) }))
  const resolved = resolveDistribution(ordered, total, { sendRemainder, unallocatedWalletId: unallocatedId })

  const resolvedTotal = resolved.distributed
  const percentSum    = listWallets.reduce((s, w) => {
    const r = rows[w.id]
    const v = Number(r?.value || 0)
    if (!v || v <= 0) return s
    return s + (r.mode === 'percent' ? v : (v / total) * 100)
  }, 0)

  const remainder = resolved.remainder
  const complete  = resolved.complete
  const notOver   = resolved.notOver

  // In outbound mode the chosen amount must be positive and within the available balance.
  const amountValid = !outbound || (total > 0 && total <= maxAmount + 0.005)

  const canConfirm = (strictMode
    ? notOver && (complete || (sendRemainder && !!unallocatedId))
    : true) && amountValid

  // ── Mode conversions ───────────────────────────────────────────────────────

  function convertValue(value, fromMode, toMode) {
    const v = Number(value || 0)
    if (!v || v <= 0) return value          // empty / zero stays as-is
    if (fromMode === toMode) return value
    if (toMode === 'percent') return String(round2((v / total) * 100))
    return String(round2((v / 100) * total))
  }

  function setAllMode(toMode) {
    setRows(prev => {
      const next = {}
      for (const [id, r] of Object.entries(prev)) {
        next[id] = { mode: toMode, value: convertValue(r.value, r.mode, toMode) }
      }
      return next
    })
    setGlobalMode(toMode)
  }

  function setRowMode(walletId, toMode) {
    setRows(prev => {
      const r = prev[walletId] ?? { value: '', mode: 'euro' }
      return { ...prev, [walletId]: { mode: toMode, value: convertValue(r.value, r.mode, toMode) } }
    })
  }

  function setRowValue(walletId, value) {
    setRows(prev => {
      const r = prev[walletId] ?? { value: '', mode: globalMode }
      return { ...prev, [walletId]: { ...r, value } }
    })
  }

  // ── Confirm ─────────────────────────────────────────────────────────────────

  function handleConfirm() {
    // The pure resolver produces the explicit rows, the materialised remainder sweep, and the
    // euro distributions — identical to the previous inline logic.
    const { explicit, remainderRow, allRows, distributions } = resolved
    onConfirm(distributions, {
      rows: explicit,        // explicit rows only — consumers that store a flag (templates) use this
      allRows,               // explicit rows + materialised remainder — recurring rules use this
      remainderRow,
      sendRemainder,
      unallocatedWalletId: unallocatedId,
    })
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  const groups = GROUPS
    .map(g => ({ ...g, list: listWallets.filter(g.match) }))
    .filter(g => g.list.length > 0)

  function ModePill({ mode, onChange, size = 'sm' }) {
    const pad = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
    return (
      <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {['euro', 'percent'].map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`${pad} rounded-md font-medium transition-colors ${
              mode === m
                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {m === 'euro' ? '€' : '%'}
          </button>
        ))}
      </div>
    )
  }

  const euroPct = total > 0 ? Math.min((resolvedTotal / total) * 100, 100) : 0
  const pctPct  = Math.min(percentSum, 100)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            {outbound ? 'Distribute from Unallocated' : `Distribute ${fmtEur(totalAmount)}`}
          </h2>
          {onClose && (
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Amount to distribute (outbound only) */}
        {outbound && (
          <div className="px-6 py-3 border-b border-stone-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Amount to distribute</label>
              <span className="text-xs text-gray-400 dark:text-gray-500">Available: {fmtEur(maxAmount)}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                max={maxAmount}
                value={outboundAmount}
                onChange={e => setOutboundAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 px-3 py-2 text-sm text-right border border-stone-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => setOutboundAmount(String(round2(maxAmount)))}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-stone-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-800"
              >
                Max
              </button>
            </div>
            {total > maxAmount + 0.005 && (
              <p className="text-xs text-[#A32D2D] mt-1">Amount exceeds the available balance.</p>
            )}
          </div>
        )}

        {/* Global mode toggle */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-stone-100 dark:border-gray-800 flex-shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400">Set all wallets to</span>
          <ModePill mode={globalMode} onChange={setAllMode} size="md" />
        </div>

        {/* Wallet list */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">Loading wallets…</p>
          ) : wallets.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-6">No wallets available.</p>
          ) : (
            <div className="space-y-5">
              {groups.map(group => (
                <div key={group.key}>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                    {group.label}
                  </p>
                  <div>
                    {group.list.map(wallet => {
                      const r    = rows[wallet.id] ?? { value: '', mode: globalMode }
                      const hint = budgetHint(wallet)
                      return (
                        <div key={wallet.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-stone-100 dark:border-gray-800 last:border-0">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: wallet.colour }} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{wallet.name}</p>
                              {hint && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={r.value}
                              onChange={e => setRowValue(wallet.id, e.target.value)}
                              placeholder={r.mode === 'euro' ? '0.00' : '0'}
                              className="w-20 px-2 py-1.5 text-sm text-right border border-stone-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                            />
                            <ModePill mode={r.mode} onChange={m => setRowMode(wallet.id, m)} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 border-t border-stone-100 dark:border-gray-800 flex-shrink-0 space-y-3">

          {/* Remainder sweep — never shown in outbound mode (money is leaving Unallocated) */}
          {!outbound && unallocatedId && (
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={sendRemainder}
                  onChange={e => setSendRemainder(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                />
                Send remainder to Unallocated
              </span>
              <span className={`text-sm font-medium ${remainder < -0.005 ? 'text-[#A32D2D]' : 'text-gray-500 dark:text-gray-400'}`}>
                {remainder >= 0 ? fmtEur(remainder) : `−${fmtEur(Math.abs(remainder))}`}
              </span>
            </label>
          )}

          {/* Two progress bars, side by side */}
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500 dark:text-gray-400">Euro</span>
                <span className={`font-semibold ${complete ? 'text-[#3B6D11]' : 'text-gray-600 dark:text-gray-300'}`}>
                  {fmtEur(resolvedTotal)} of {fmtEur(total)}
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${complete ? 'bg-[#3B6D11]' : 'bg-indigo-500'}`}
                  style={{ width: `${euroPct}%` }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500 dark:text-gray-400">Percent</span>
                <span className={`font-semibold ${complete ? 'text-[#3B6D11]' : 'text-gray-600 dark:text-gray-300'}`}>
                  {fmtPct(percentSum)}% of 100%
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${complete ? 'bg-[#3B6D11]' : 'bg-indigo-500'}`}
                  style={{ width: `${pctPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          {saving ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Template name"
                autoFocus
                className="flex-1 px-3 py-2 text-sm border border-stone-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                onClick={saveTemplate}
                disabled={!saveName.trim()}
                className={`py-2 px-3 rounded-lg text-sm font-medium ${
                  saveName.trim()
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                Save
              </button>
              <button
                onClick={() => { setSaving(false); setSaveName('') }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          ) : allowTemplates ? (
            <div className="flex gap-3 items-center">
              <button
                onClick={() => { setSaveName(entryName ?? ''); setSaving(true) }}
                className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 whitespace-nowrap"
              >
                {savedMsg
                  ? <span className="text-[#3B6D11] flex items-center gap-1"><Check size={14} /> Saved</span>
                  : 'Save as template'}
              </button>
              <div className="flex gap-3 flex-1 justify-end">
                {onClose && (
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg border border-stone-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    canConfirm
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Distribute
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg border border-stone-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canConfirm
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                Distribute
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
