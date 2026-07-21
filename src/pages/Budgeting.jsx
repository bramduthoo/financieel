import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SlidersHorizontal, Settings2, AlertTriangle } from 'lucide-react'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'
import { isMustFund, isFreePool, buildBudgetPlan, autoFillSingle, resolveIncomeEdit } from '../lib/budgetPlan'
import SummaryStrip from '../components/ui/SummaryStrip'
import PageHeader from '../components/ui/PageHeader'
import BudgetFlowChart from '../components/budgeting/BudgetFlowChart'
import WalletTile from '../components/budgeting/WalletTile'
import DistributionEditor from '../components/budgeting/DistributionEditor'
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

  // Seed the editor from the saved rules, preserving each rule's stored mode + raw value (Option A)
  // so an untouched percent rule stays a percent rule through an edit round-trip.
  function enterEdit() {
    const init = {}
    for (const inc of includedIncomes) {
      init[inc.id] = {}
      for (const r of (rulesByIncome[inc.id] ?? [])) {
        if (r.wallet_id === unallocId) continue   // the remainder sweep is derived, never edited
        init[inc.id][r.wallet_id] = {
          mode: r.mode === 'percent' ? 'percent' : 'euro',
          // `value` can be null on pre-backfill rows — fall back to `amount` like
          // IncomeRecurringDetail does, or the row would seed as 0 and silently reroute that
          // wallet's whole allocation to Unallocated on the next save.
          value: String(round2(Number(r.value ?? r.amount))),
        }
      }
    }
    setEdits(init)
    setError(null)
    setEditMode(true)
  }

  function setEditRow(incomeId, walletId, row) {
    setEdits(prev => ({ ...prev, [incomeId]: { ...(prev[incomeId] ?? {}), [walletId]: row } }))
  }

  // Same helper the editor renders from, so the numbers on screen are the bytes we write.
  function resolveIncomeEdits(inc) {
    return resolveIncomeEdit({
      income: inc, editableWallets, edits: edits[inc.id] ?? {}, unallocatedWalletId: unallocId,
    })
  }

  function requestSave() {
    for (const inc of includedIncomes) {
      if (!resolveIncomeEdits(inc).notOver) {
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
        await writeIncomeRules(inc.id, resolveIncomeEdits(inc).allRows)
      }
      await loadAll()
      setEditMode(false)
    } catch (e) {
      // Incomes are written one at a time, so a mid-loop failure leaves earlier incomes rewritten.
      // Re-read so the UI shows what is actually stored rather than the stale pre-save state.
      setError(e?.message || 'Could not save the plan.')
      await loadAll().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-ink-faint p-8">Loading…</p>

  // Empty state (§12.2) — card-less and centred on the page background, quieter than the surface it
  // sits on: this is an absence, not content.
  if (incomes.length === 0 || noWallets) {
    return (
      <div className="max-w-6xl">
        <PageHeader title="Budgeting" />
        <div className="flex flex-col items-center justify-center text-center min-h-[52vh]">
          <p className="text-ink-muted">Budgeting needs a recurring income and at least one wallet.</p>
          <p className="text-sm text-ink-faint mt-1 mb-6">Set those up and the plan builds itself.</p>
          <div className="flex gap-3">
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
    <div className="max-w-6xl">
      <PageHeader
        title="Budgeting"
        actions={mode === 'plan' && !editMode && (
          <>
            {/* Configure = which incomes are in the plan. Meaningless with a single always-included
                income, so it hides in that case (§12.3) — but it MUST stay reachable whenever any
                income is excluded, or a user with one excluded income has no route back to setup. */}
            {(incomes.length > 1 || includedIncomes.length !== incomes.length) && (
              <button
                onClick={() => setMode('setup')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ink-soft border border-card-border rounded-[9px] hover:bg-track transition-colors"
              >
                <Settings2 size={15} /> Configure
              </button>
            )}
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
          <h2 className="text-sm font-medium text-ink mb-3">Recurring incomes in the plan</h2>
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
          <h2 className="text-sm font-medium text-ink mb-3">Wallets</h2>
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

  function requestAutoDistribute() {
    setConfirm({
      title: 'Apply auto-distribution?',
      body: (
        <span>
          This fills every must-fund wallet to its budget in order and sweeps the remainder to
          Unallocated, <strong>replacing the current allocation</strong> for this income. Already-logged
          income is not affected.
        </span>
      ),
      confirmLabel: 'Apply',
      onConfirm: doAutoDistribute,
    })
  }

  async function doAutoDistribute() {
    setConfirm(null)
    const inc = includedIncomes[0]
    if (!inc || !unallocId) { setError('No income or Unallocated wallet found.'); return }
    setBusy(true)
    try {
      const { rows } = autoFillSingle({ income: inc, wallets, unallocatedWalletId: unallocId })
      await writeIncomeRules(inc.id, rows)
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Could not apply the auto-distribution.')
    } finally {
      setBusy(false)
    }
  }

  function renderPlan() {
    const leftover = round2(plan.totalIncome - plan.coveredTotal)

    // Every wallet gets a tile: must-fund ones show % of budget, free-pool ones show the amount.
    const tileWallets = wallets.filter(w => isMustFund(w) || isFreePool(w))
    const allocations = includedIncomes.flatMap(inc =>
      (rulesByIncome[inc.id] ?? []).map(r => ({
        income_id: inc.id, wallet_id: r.wallet_id, amount: Number(r.amount),
      })))

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Flow chart — one card, one SVG, every included income */}
          <div className="lg:col-span-2 bg-card border border-card-border rounded-[14px] p-5">
            <BudgetFlowChart
              incomes={includedIncomes}
              allocations={allocations}
              wallets={wallets}
            />
          </div>

          {/* Rail: wallet tiles + the single-income auto-distribute action */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {tileWallets.map(w => (
                <WalletTile
                  key={w.id}
                  wallet={w}
                  funded={plan.fundedByWallet[w.id] ?? 0}
                  budget={Number(w.budget) || 0}
                  freePool={isFreePool(w)}
                  onClick={() => setWalletModal(w)}
                />
              ))}
            </div>

            {includedIncomes.length === 1 && (
              <button
                onClick={requestAutoDistribute}
                disabled={busy}
                className="w-full px-4 py-2.5 rounded-[9px] bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {busy ? 'Applying…' : 'Apply auto-distribution'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderEdit() {
    return (
      <DistributionEditor
        incomes={includedIncomes}
        wallets={wallets}
        editableWallets={editableWallets}
        unallocatedWalletId={unallocId}
        edits={edits}
        onChange={setEditRow}
        onCancel={() => { setEditMode(false); setError(null) }}
        onSave={requestSave}
        busy={busy}
      />
    )
  }
}
