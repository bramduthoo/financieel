import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SlidersHorizontal, Settings2, AlertTriangle, Check } from 'lucide-react'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'
import { isMustFund, buildBudgetPlan, autoFillSingle, buildRuleRows } from '../lib/budgetPlan'
import SummaryStrip from '../components/ui/SummaryStrip'
import MetricBar from '../components/ui/MetricBar'
import PageHeader from '../components/ui/PageHeader'
import SalarySankey from '../components/budgeting/SalarySankey'
import WalletModal from '../components/WalletModal'
import IncomeConfirmModal from '../components/IncomeConfirmModal'

const round2 = n => Number(Number(n).toFixed(2))

export default function Budgeting() {
  const [incomes,       setIncomes]       = useState([])
  const [rulesByIncome, setRulesByIncome] = useState({})
  const [wallets,       setWallets]       = useState([])
  const [unallocId,     setUnallocId]     = useState(null)
  const [loading,       setLoading]       = useState(true)

  const [includeMap, setIncludeMap] = useState({})   // incomeId → boolean
  const [mode,       setMode]       = useState('plan') // 'setup' | 'plan'
  const [editMode,   setEditMode]   = useState(false)
  const [edits,      setEdits]      = useState({})   // incomeId → { walletId → amountString }
  const [error,      setError]      = useState(null)
  const [busy,       setBusy]       = useState(false)

  const [walletModal, setWalletModal] = useState(null)  // wallet being edited
  const [confirm,     setConfirm]     = useState(null)  // IncomeConfirmModal payload

  useEffect(() => { loadAll(true) }, [])

  async function loadAll(initial = false) {
    if (initial) setLoading(true)
    const [{ data: inc }, { data: w }] = await Promise.all([
      supabase.from('income_recurring').select('*').is('end_date', null).order('start_date', { ascending: true }),
      supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
    ])
    const activeIncomes = inc ?? []
    const ws = w ?? []

    let byIncome = {}
    if (activeIncomes.length > 0) {
      const { data: rules } = await supabase
        .from('income_distribution_rules')
        .select('*')
        .in('income_recurring_id', activeIncomes.map(i => i.id))
        .order('priority')
      for (const r of rules ?? []) (byIncome[r.income_recurring_id] ??= []).push(r)
    }

    setIncomes(activeIncomes)
    setWallets(ws)
    setRulesByIncome(byIncome)
    setUnallocId(ws.find(x => x.is_system)?.id ?? null)
    if (initial) {
      setIncludeMap(Object.fromEntries(activeIncomes.map(i => [i.id, i.include_in_budget !== false])))
      const hasRules = activeIncomes.some(i => (byIncome[i.id] ?? []).length > 0)
      setMode(hasRules ? 'plan' : 'setup')
      setLoading(false)
    }
    return { incomes: activeIncomes, rulesByIncome: byIncome, wallets: ws, unallocId: ws.find(x => x.is_system)?.id ?? null }
  }

  const includedIncomes = useMemo(() => incomes.filter(i => includeMap[i.id]), [incomes, includeMap])
  const mustFundWallets = useMemo(() => wallets.filter(isMustFund), [wallets])
  // Wallets a per-income allocation can name explicitly (Unallocated is the auto remainder target).
  const editableWallets = useMemo(() => wallets.filter(w => !w.is_system), [wallets])
  const walletById      = useMemo(() => Object.fromEntries(wallets.map(w => [w.id, w])), [wallets])

  const plan = useMemo(
    () => buildBudgetPlan({ incomes: includedIncomes, rulesByIncome, wallets }),
    [includedIncomes, rulesByIncome, wallets],
  )

  const noWallets = wallets.filter(w => !w.is_system).length === 0

  // ── Writes ─────────────────────────────────────────────────────────────────

  // delete-all-for-income + reinsert (mirrors IncomeRecurringDetail). Throws on error so callers can
  // surface it and never leave an income half-written (delete succeeded, insert failed → no rules).
  async function writeIncomeRules(incomeId, rows) {
    const userId = await getCurrentUserId()
    const { error: delErr } = await supabase.from('income_distribution_rules').delete().eq('income_recurring_id', incomeId)
    if (delErr) throw delErr
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('income_distribution_rules').insert(
        rows.map((r, i) => ({
          income_recurring_id: incomeId, wallet_id: r.wallet_id,
          mode: r.mode, value: r.value, amount: r.amount, priority: i, user_id: userId,
        })),
      )
      if (insErr) throw insErr
    }
  }

  async function persistIncludes(map, list) {
    const results = await Promise.all(list.map(inc =>
      supabase.from('income_recurring').update({ include_in_budget: !!map[inc.id] }).eq('id', inc.id),
    ))
    const err = results.find(r => r.error)?.error
    if (err) throw err
  }

  // ── Setup ────────────────────────────────────────────────────────────────────

  const setupSingle = includedIncomes.length === 1 ? includedIncomes[0] : null
  const setupTotalBudget = round2(mustFundWallets.reduce((s, w) => s + (Number(w.budget) || 0), 0))
  const setupUnderfunded = setupSingle && Number(setupSingle.amount) < setupTotalBudget - 0.005

  async function applySetup() {
    const included = incomes.filter(i => includeMap[i.id])
    if (included.length === 0) { setError('Select at least one recurring income to include.'); return }
    if (!unallocId) { setError('No Unallocated wallet found — cannot save the plan.'); return }
    setError(null)
    setBusy(true)
    try {
      await persistIncludes(includeMap, incomes)
      if (included.length === 1) {
        const { rows } = autoFillSingle({ income: included[0], wallets, unallocatedWalletId: unallocId })
        await writeIncomeRules(included[0].id, rows)
      }
      await loadAll()
      setMode('plan')
      setEditMode(false)
    } catch (e) {
      setError(e?.message || 'Could not save the plan. Nothing was changed if this was the first step.')
    } finally {
      setBusy(false)
    }
  }

  // ── Wallet budget editing (reuses WalletModal; re-applies auto-fill for a single income) ──────

  async function handleWalletSave(values) {
    const { error } = await supabase.from('wallets').update(values).eq('id', walletModal.id)
    setWalletModal(null)
    if (error) { setError(error.message); return }
    const data = await loadAll()
    const included = data.incomes.filter(i => includeMap[i.id])
    // A single-income plan is auto-derived from budgets, so re-apply it when a budget/cap changes.
    if (included.length === 1 && data.unallocId) {
      try {
        const { rows } = autoFillSingle({ income: included[0], wallets: data.wallets, unallocatedWalletId: data.unallocId })
        await writeIncomeRules(included[0].id, rows)
        await loadAll()
      } catch (e) {
        setError(e?.message || 'Saved the wallet, but could not re-apply the distribution.')
      }
    }
  }

  // ── Edit mode (multi-income manual distribution) ─────────────────────────────

  function enterEdit() {
    const init = {}
    for (const inc of includedIncomes) {
      init[inc.id] = {}
      for (const r of (rulesByIncome[inc.id] ?? [])) {
        if (r.wallet_id !== unallocId) init[inc.id][r.wallet_id] = String(round2(r.amount))
      }
    }
    setEdits(init)
    setError(null)
    setEditMode(true)
  }

  function setEditValue(incomeId, walletId, value) {
    setEdits(prev => ({ ...prev, [incomeId]: { ...(prev[incomeId] ?? {}), [walletId]: value } }))
  }

  function incomeAssigned(incomeId) {
    const m = edits[incomeId] ?? {}
    return round2(Object.values(m).reduce((s, v) => s + (Number(v) || 0), 0))
  }

  function requestSave() {
    for (const inc of includedIncomes) {
      if (incomeAssigned(inc.id) > Number(inc.amount) + 0.005) {
        setError(`"${inc.name}" distributes more than its amount (${formatMoney(inc.amount)}).`); return
      }
    }
    setError(null)
    setConfirm({
      title: 'Save budget plan?',
      body: (
        <span>
          This updates the distribution for each recurring income across the whole app — it rewrites
          their distribution setup under <strong>Income</strong> and changes how future income is
          distributed. Already-logged income is not affected.
        </span>
      ),
      confirmLabel: 'Save plan',
      onConfirm: doSave,
    })
  }

  async function doSave() {
    setConfirm(null)
    if (!unallocId) { setError('No Unallocated wallet found — cannot save the plan.'); return }
    setBusy(true)
    try {
      for (const inc of includedIncomes) {
        const allocations = editableWallets
          .map(w => ({ wallet_id: w.id, amount: Number(edits[inc.id]?.[w.id] || 0) }))
          .filter(a => a.amount > 0)
        const rows = buildRuleRows({
          incomeAmount: Number(inc.amount), allocations,
          existingRules: rulesByIncome[inc.id] ?? [], unallocatedWalletId: unallocId,
        })
        await writeIncomeRules(inc.id, rows)
      }
      await loadAll()
      setEditMode(false)
    } catch (e) {
      setError(e?.message || 'Could not save the plan.')
    } finally {
      setBusy(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-ink-faint p-8">Loading…</p>

  // Empty state — budgeting needs at least one recurring income and one wallet.
  if (incomes.length === 0 || noWallets) {
    return (
      <div className="max-w-xl">
        <PageHeader title="Budgeting" />
        <div className="bg-card border border-card-border rounded-[14px] p-8 text-center">
          <p className="text-ink-soft mb-1">Budgeting needs a recurring income and at least one wallet.</p>
          <p className="text-sm text-ink-muted mb-5">
            Set those up first — the plan distributes your recurring income across your wallets.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/income" className="px-4 py-2 rounded-[9px] bg-ink text-cream text-sm font-medium hover:opacity-90 transition-opacity">
              Add recurring income
            </Link>
            <Link to="/wallets" className="px-4 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors">
              Set up wallets
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Budgeting"
        actions={mode === 'plan' && !editMode && (
          <>
            <button
              onClick={() => setMode('setup')}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ink-soft border border-card-border rounded-[9px] hover:bg-track transition-colors"
            >
              <Settings2 size={15} /> Configure
            </button>
            {includedIncomes.length > 1 && (
              <button
                onClick={enterEdit}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-ink text-cream rounded-[9px] hover:opacity-90 transition-opacity"
              >
                <SlidersHorizontal size={15} /> Edit distribution
              </button>
            )}
          </>
        )}
      />

      {error && <p className="text-negative text-sm mb-4">{error}</p>}

      {mode === 'setup'
        ? renderSetup()
        : editMode
          ? renderEdit()
          : renderPlan()}

      {/* Wallet budget/cap editor */}
      {walletModal && (
        <WalletModal
          wallet={walletModal}
          onClose={() => setWalletModal(null)}
          onSave={handleWalletSave}
        />
      )}

      {/* Save verification */}
      {confirm && (
        <IncomeConfirmModal
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )

  // ── Sub-renders ──────────────────────────────────────────────────────────────

  function renderSetup() {
    return (
      <div className="space-y-6">
        <div className="bg-card border border-card-border rounded-[14px] p-5">
          <h2 className="text-sm font-medium text-ink mb-1">Recurring incomes in the plan</h2>
          <p className="text-xs text-ink-muted mb-3">Select which recurring incomes fund your wallet budgets.</p>
          <div className="divide-y divide-inner-border">
            {incomes.map(inc => (
              <label key={inc.id} className="flex items-center justify-between py-2.5 cursor-pointer">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!includeMap[inc.id]}
                    onChange={e => setIncludeMap(m => ({ ...m, [inc.id]: e.target.checked }))}
                    className="w-4 h-4 rounded border-card-border accent-[var(--color-accent-solid)]"
                  />
                  <div>
                    <p className="text-sm text-ink">{inc.name}</p>
                    <p className="text-[11px] text-ink-muted capitalize">{inc.frequency}</p>
                  </div>
                </div>
                <span className="text-sm font-medium text-ink tracking-tight">{formatMoney(inc.amount)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-[14px] p-5">
          <h2 className="text-sm font-medium text-ink mb-1">Wallets</h2>
          <p className="text-xs text-ink-muted mb-3">Must-fund wallets are filled to their budget. Tap a wallet to change its budget or cap.</p>
          <div className="divide-y divide-inner-border">
            {wallets.filter(w => !w.is_system).map(w => (
              <button
                key={w.id}
                onClick={() => setWalletModal(w)}
                className="w-full flex items-center justify-between py-2.5 text-left hover:bg-track/60 -mx-2 px-2 rounded-[9px] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <WalletIcon wallet={w} size={16} className="text-ink-soft" />
                  <div>
                    <p className="text-sm text-ink">{w.name}</p>
                    <p className="text-[11px] text-ink-muted capitalize">{isMustFund(w) ? w.budget_type : 'free pool'}</p>
                  </div>
                </div>
                <span className="text-sm text-ink-soft tracking-tight">
                  {isMustFund(w) && Number(w.budget) > 0 ? formatMoney(w.budget) : '—'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {setupUnderfunded && (
          <div className="flex items-start gap-3 bg-negative-tint border border-negative/30 rounded-[12px] p-4">
            <AlertTriangle size={16} className="text-negative shrink-0 mt-0.5" />
            <p className="text-sm text-ink-soft">
              {setupSingle.name} ({formatMoney(setupSingle.amount)}) doesn't cover all wallet budgets
              ({formatMoney(setupTotalBudget)}). Lower some budgets above, or apply anyway — wallets
              beyond the income will be left short.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          {incomes.some(i => (rulesByIncome[i.id] ?? []).length > 0) && (
            <button
              onClick={() => { setMode('plan'); setError(null) }}
              className="px-4 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={applySetup}
            disabled={busy}
            className="px-4 py-2 rounded-[9px] bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? 'Applying…' : includedIncomes.length === 1 ? 'Apply auto-distribution' : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  function renderCoverage() {
    if (plan.coverage.length === 0) return null
    return (
      <div className="bg-card border border-card-border rounded-[14px] p-5">
        <h2 className="text-sm font-medium text-ink mb-3">Budget coverage</h2>
        <div className="space-y-3">
          {plan.coverage.map(c => (
            <div key={c.wallet.id}>
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => setWalletModal(c.wallet)}
                  className="flex items-center gap-2 text-sm text-ink hover:text-accent transition-colors"
                >
                  <WalletIcon wallet={c.wallet} size={14} className="text-ink-soft" />
                  {c.wallet.name}
                </button>
                <span className="text-[11px] tracking-tight">
                  {c.status === 'short'
                    ? <span className="text-negative">short {formatMoney(c.short)}</span>
                    : c.status === 'over'
                      ? <span className="text-ink-muted">over {formatMoney(c.over)}</span>
                      : <span className="text-positive">covered</span>}
                </span>
              </div>
              <MetricBar
                value={Math.min(c.funded, c.budget)} max={c.budget}
                fillClass={c.status === 'short' ? 'bg-accent-solid' : 'bg-positive-bar'}
              />
              <p className="text-[11px] text-ink-muted mt-1">
                {formatMoney(c.funded)} of {formatMoney(c.budget)} funded
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderPlan() {
    const leftover = round2(plan.totalIncome - plan.coveredTotal)
    return (
      <div className="space-y-6">
        <SummaryStrip stats={[
          { label: 'Included income', value: formatMoney(plan.totalIncome) },
          { label: 'Budgeted', value: formatMoney(plan.totalBudget) },
          { label: 'Covered', value: formatMoney(plan.coveredTotal), tone: plan.totalShort < 0.005 ? 'positive' : 'ink' },
          plan.totalShort > 0.005
            ? { label: 'Short', value: formatMoney(plan.totalShort), tone: 'negative' }
            : { label: 'To free pool', value: formatMoney(Math.max(0, leftover)), tone: 'coral' },
        ]} />

        {renderCoverage()}

        {/* Per-income flow */}
        {includedIncomes.map(inc => {
          const rules = rulesByIncome[inc.id] ?? []
          const flows = rules.map(r => ({ wallet: walletById[r.wallet_id], amount: Number(r.amount) }))
          return (
            <div key={inc.id} className="bg-card border border-card-border rounded-[14px] p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-ink">{inc.name}</h2>
                <span className="text-sm font-medium text-ink tracking-tight">{formatMoney(inc.amount)}</span>
              </div>
              {flows.length > 0
                ? <SalarySankey income={Number(inc.amount)} flows={flows} />
                : <p className="text-sm text-ink-faint py-6 text-center">No distribution set for this income yet — use Edit distribution.</p>}
            </div>
          )
        })}
      </div>
    )
  }

  function renderEdit() {
    return (
      <div className="space-y-6">
        <p className="text-xs text-ink-muted">
          Set how much of each income goes to each wallet. Whatever you don't assign flows to
          Unallocated. Must-fund wallets show their budget target; the summary flags any that fall short.
        </p>

        {includedIncomes.map(inc => {
          const assigned  = incomeAssigned(inc.id)
          const remaining = round2(Number(inc.amount) - assigned)
          const over      = remaining < -0.005
          return (
            <div key={inc.id} className="bg-card border border-card-border rounded-[14px] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-ink">{inc.name}</h2>
                <span className="text-sm font-medium text-ink tracking-tight">{formatMoney(inc.amount)}</span>
              </div>
              <div className="divide-y divide-inner-border">
                {editableWallets.map(w => {
                  const budget = Number(w.budget) || 0
                  return (
                    <div key={w.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <WalletIcon wallet={w} size={14} className="text-ink-soft shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{w.name}</p>
                          {isMustFund(w) && budget > 0 && (
                            <p className="text-[11px] text-ink-muted">budget {formatMoney(budget)}</p>
                          )}
                        </div>
                      </div>
                      <input
                        type="number" min="0" step="0.01"
                        value={edits[inc.id]?.[w.id] ?? ''}
                        onChange={e => setEditValue(inc.id, w.id, e.target.value)}
                        placeholder="0.00"
                        className="w-24 px-2 py-1.5 text-sm text-right bg-field border border-card-border rounded-[8px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-3 text-[11px]">
                <span className="text-ink-muted">
                  {over ? 'Over-distributed' : 'To Unallocated'}
                </span>
                <span className={`tracking-tight font-medium ${over ? 'text-negative' : 'text-ink-soft'}`}>
                  {over ? `−${formatMoney(Math.abs(remaining))}` : formatMoney(remaining)}
                </span>
              </div>
            </div>
          )
        })}

        {/* Live coverage across the edited plan (from saved rules; recomputed after save) */}
        {plan.totalShort > 0.005 && (
          <div className="flex items-start gap-3 bg-negative-tint border border-negative/30 rounded-[12px] p-4">
            <AlertTriangle size={16} className="text-negative shrink-0 mt-0.5" />
            <p className="text-sm text-ink-soft">
              After the last save, {formatMoney(plan.totalShort)} of budgets was still unfunded across
              your wallets. Adjust the amounts above so each budget is covered.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={() => { setEditMode(false); setError(null) }}
            className="px-4 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={requestSave}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Check size={15} /> {busy ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </div>
    )
  }
}
