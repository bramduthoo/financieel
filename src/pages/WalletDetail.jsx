import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings, Plus, Trash2, X, Edit2 } from 'lucide-react'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import RecurringRules from '../components/RecurringRules'
import TransactionChecklist from '../components/TransactionChecklist'
import UpcomingPayments from '../components/UpcomingPayments'
import PaymentHistory from '../components/PaymentHistory'
import WalletModal from '../components/WalletModal'
import VariableOverview from '../components/VariableOverview'
import VariableHistory from '../components/VariableHistory'
import WalletTrendsChart from '../components/WalletTrendsChart'
import DistributionPopup from '../components/DistributionPopup'
import UnallocatedConflictBanner from '../components/UnallocatedConflictBanner'
import { evaluateUnallocatedPlans } from '../lib/unallocatedPlans'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'

const round2 = n => Number(Number(n).toFixed(2))

const PLAN_MODES = [
  { value: 'amount_over_threshold', label: 'Everything above the threshold' },
  { value: 'fixed_amount',          label: 'A fixed amount' },
  { value: 'full_balance',          label: 'The full balance' },
]

export default function WalletDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [wallet,       setWallet]       = useState(null)
  const [rules,        setRules]        = useState([])
  const [transactions, setTransactions] = useState([])
  const [tab,          setTab]          = useState('overview')
  const [editOpen,     setEditOpen]     = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [strictMode,      setStrictMode]      = useState(true)
  const [distributeOpen,  setDistributeOpen]  = useState(false)
  const [distributeError, setDistributeError] = useState(null)
  const [outboundPrefill, setOutboundPrefill] = useState(null)   // null | { existingRules, initialAmount }

  // Unallocated templates
  const [unallocTemplates, setUnallocTemplates] = useState([])
  const [destWallets,      setDestWallets]      = useState([])   // active, non-system (valid destinations)
  const [createOpen,       setCreateOpen]       = useState(false)
  const [createForm,       setCreateForm]       = useState({ name: '', items: [{ wallet_id: '', mode: 'euro', value: '' }] })
  const [createError,      setCreateError]      = useState(null)

  // Unallocated automatic plans
  const [unallocPlans, setUnallocPlans] = useState([])
  const [planOpen,     setPlanOpen]     = useState(false)
  const [planForm,     setPlanForm]     = useState({ name: '', threshold: '', distribute_mode: 'amount_over_threshold', distribute_amount: '', items: [{ wallet_id: '', mode: 'euro', value: '' }] })
  const [planError,    setPlanError]    = useState(null)
  const [conflictRefresh, setConflictRefresh] = useState(0)   // re-check the conflict banner after balance changes
  const [histView,        setHistView]        = useState('incoming')   // Unallocated History sub-view

  useEffect(() => { fetchAll(true) }, [id])

  // Load Unallocated-specific data (templates + valid destination wallets) once the wallet is known.
  useEffect(() => {
    if (wallet?.type === 'unallocated') fetchUnallocData()
  }, [wallet?.type, wallet?.id])

  async function fetchUnallocData() {
    const [{ data: tpls }, { data: ws }, { data: plans }] = await Promise.all([
      supabase.from('unallocated_templates')
        .select('*, unallocated_template_items(*)')
        .order('created_at', { ascending: true }),
      supabase.from('wallets').select('*')
        .eq('is_active', true).eq('is_system', false).order('sort_order'),
      supabase.from('unallocated_plans')
        .select('*, unallocated_plan_items(*)')
        .order('created_at', { ascending: true }),
    ])
    setUnallocTemplates(tpls ?? [])
    setDestWallets(ws ?? [])
    setUnallocPlans(plans ?? [])
  }

  async function fetchAll(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [{ data: w }, { data: r }, { data: t }, { data: s }] = await Promise.all([
      supabase.from('wallets').select('*').eq('id', id).single(),
      supabase.from('recurring_rules').select('*')
        .eq('wallet_id', id).is('end_date', null).order('created_at'),
      supabase.from('transactions').select('*').eq('wallet_id', id),
      supabase.from('settings').select('strict_distribution').single(),
    ])
    setWallet(w)
    setRules(r ?? [])
    setTransactions(t ?? [])
    setStrictMode(s?.strict_distribution ?? true)
    setLoading(false)
  }

  // ── Unallocated template helpers ─────────────────────────────────────────────
  function walletName(wid) {
    return destWallets.find(w => w.id === wid)?.name ?? '—'
  }
  function planTargets(p) {
    const items = p.unallocated_plan_items ?? []
    return items.length === 0
      ? '—'
      : items.map(i => `${walletName(i.wallet_id)} ${i.mode === 'percent' ? `${Number(i.value)}%` : formatMoney(Number(i.value))}`).join(', ')
  }
  function planTrigger(p) {
    const thr = formatMoney(Number(p.threshold))
    const targets = planTargets(p)
    if (p.distribute_mode === 'amount_over_threshold') return `Sweep everything above ${thr} → ${targets}`
    if (p.distribute_mode === 'fixed_amount')          return `When over ${thr}, distribute ${formatMoney(Number(p.distribute_amount))} → ${targets}`
    return `When over ${thr}, distribute the full balance → ${targets}`
  }
  // Label an Unallocated outgoing (debit) move from its note.
  function outgoingLabel(note) {
    if (note && note.startsWith('Auto-plan:')) return { badge: 'Auto-plan', text: note.slice('Auto-plan:'.length).trim() }
    if (note && note.startsWith('Template:'))  return { badge: 'Template',  text: note.slice('Template:'.length).trim() }
    return { badge: null, text: 'Manual distribution' }
  }
  function openCreate() {
    setCreateError(null)
    setCreateForm({ name: '', items: [{ wallet_id: '', mode: 'euro', value: '' }] })
    setCreateOpen(true)
  }
  function addCreateItem() {
    setCreateForm(f => ({ ...f, items: [...f.items, { wallet_id: '', mode: 'euro', value: '' }] }))
  }
  function removeCreateItem(idx) {
    setCreateForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }
  function updateCreateItem(idx, patch) {
    setCreateForm(f => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }))
  }
  async function saveTemplate() {
    const name  = createForm.name.trim()
    const items = createForm.items.filter(it => it.wallet_id && Number(it.value) > 0)
    if (!name)            { setCreateError('Enter a name.'); return }
    if (items.length === 0) { setCreateError('Add at least one destination with an amount.'); return }
    const userId = await getCurrentUserId()
    const { data: tpl, error } = await supabase.from('unallocated_templates')
      .insert({ name, user_id: userId }).select().single()
    if (error || !tpl) { setCreateError(error?.message || 'Could not save the template.'); return }
    const { error: itemsErr } = await supabase.from('unallocated_template_items').insert(
      items.map(it => ({
        template_id: tpl.id,
        wallet_id: it.wallet_id,
        mode: it.mode,
        value: round2(it.value),
        user_id: userId,
      }))
    )
    if (itemsErr) { setCreateError(itemsErr.message || 'Could not save the destinations.'); return }
    setCreateOpen(false)
    fetchUnallocData()
  }
  function applyTemplate(t) {
    const items   = t.unallocated_template_items ?? []
    const allEuro = items.length > 0 && items.every(i => i.mode === 'euro')
    const floor   = round2(items.filter(i => i.mode === 'euro').reduce((s, i) => s + Number(i.value), 0))
    setOutboundPrefill({
      existingRules: items.map(i => ({ wallet_id: i.wallet_id, mode: i.mode, value: Number(i.value) })),
      initialAmount: allEuro ? floor : Number(wallet.balance),
      note: 'Template: ' + t.name,
    })
    setDistributeError(null)
    setDistributeOpen(true)
  }

  // ── Automatic plan helpers ───────────────────────────────────────────────────
  function openPlan() {
    setPlanError(null)
    setPlanForm({ isEdit: false, id: null, name: '', threshold: '', distribute_mode: 'amount_over_threshold', distribute_amount: '', items: [{ wallet_id: '', mode: 'percent', value: '' }] })
    setPlanOpen(true)
  }
  function openPlanEdit(p) {
    setPlanError(null)
    const items = (p.unallocated_plan_items ?? []).map(i => ({ wallet_id: i.wallet_id, mode: i.mode, value: String(i.value) }))
    setPlanForm({
      isEdit: true,
      id: p.id,
      name: p.name,
      threshold: String(p.threshold),
      distribute_mode: p.distribute_mode,
      distribute_amount: p.distribute_amount != null ? String(p.distribute_amount) : '',
      items: items.length > 0 ? items : [{ wallet_id: '', mode: p.distribute_mode === 'fixed_amount' ? 'euro' : 'percent', value: '' }],
    })
    setPlanOpen(true)
  }
  function setPlanMode(mode) {
    // Non-fixed modes distribute a variable amount, so only percent items make sense.
    setPlanForm(f => ({
      ...f,
      distribute_mode: mode,
      distribute_amount: mode === 'fixed_amount' ? f.distribute_amount : '',
      items: mode === 'fixed_amount' ? f.items : f.items.map(it => ({ ...it, mode: 'percent', value: clampPlanValue(it.value, 'percent') })),
    }))
  }
  function clampPlanValue(raw, mode) {
    if (mode === 'percent' && raw !== '' && !isNaN(Number(raw))) {
      const n = Number(raw)
      if (n > 100) return '100'
      if (n < 0)   return '0'
    }
    return raw
  }
  function addPlanItem() {
    setPlanForm(f => ({ ...f, items: [...f.items, { wallet_id: '', mode: f.distribute_mode === 'fixed_amount' ? 'euro' : 'percent', value: '' }] }))
  }
  function removePlanItem(idx) {
    setPlanForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }
  function updatePlanItem(idx, patch) {
    setPlanForm(f => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }))
  }
  async function savePlan() {
    const name  = planForm.name.trim()
    const isFixed = planForm.distribute_mode === 'fixed_amount'
    const thresholdNum = Number(planForm.threshold)
    // Non-fixed modes force percent items.
    const rawItems = planForm.items.filter(it => it.wallet_id && Number(it.value) > 0)
    const items = rawItems.map(it => ({ ...it, mode: isFixed ? it.mode : 'percent' }))

    if (!name)                                                                 { setPlanError('Enter a name.'); return }
    if (planForm.threshold === '' || isNaN(thresholdNum) || thresholdNum < 0)  { setPlanError('Enter a valid threshold.'); return }
    if (isFixed && !(Number(planForm.distribute_amount) > 0))                   { setPlanError('Enter the fixed amount to distribute.'); return }
    if (items.length === 0)                                                     { setPlanError('Add at least one destination with an amount.'); return }

    // Sum constraint — the split must fully allocate the amount the plan distributes.
    if (isFixed) {
      const target = round2(Number(planForm.distribute_amount))
      const sum = round2(items.reduce((s, it) => s + (it.mode === 'percent' ? (Number(it.value) / 100) * target : Number(it.value)), 0))
      if (Math.abs(target - sum) >= 0.005) { setPlanError(`The split must add up to ${formatMoney(target)} (currently ${formatMoney(sum)}).`); return }
    } else {
      if (items.some(it => Number(it.value) < 0 || Number(it.value) > 100)) { setPlanError('Percentages must be between 0 and 100.'); return }
      const pct = round2(items.reduce((s, it) => s + Number(it.value), 0))
      if (Math.abs(100 - pct) >= 0.01) { setPlanError(`Percentages must add up to 100% (currently ${pct}%).`); return }
    }

    const userId = await getCurrentUserId()
    const payload = {
      name,
      threshold: round2(thresholdNum),
      distribute_mode: planForm.distribute_mode,
      distribute_amount: isFixed ? round2(planForm.distribute_amount) : null,
    }

    let planId = planForm.id
    if (planForm.isEdit) {
      const { error } = await supabase.from('unallocated_plans').update(payload).eq('id', planForm.id)
      if (error) { setPlanError(error.message || 'Could not update the plan.'); return }
      // Replace items.
      await supabase.from('unallocated_plan_items').delete().eq('plan_id', planForm.id)
    } else {
      const { data: plan, error } = await supabase.from('unallocated_plans')
        .insert({ ...payload, is_active: true, user_id: userId }).select().single()
      if (error || !plan) { setPlanError(error?.message || 'Could not save the plan.'); return }
      planId = plan.id
    }

    const { error: itemsErr } = await supabase.from('unallocated_plan_items').insert(
      items.map(it => ({
        plan_id: planId,
        wallet_id: it.wallet_id,
        mode: it.mode,
        value: round2(it.value),
        user_id: userId,
      }))
    )
    if (itemsErr) { setPlanError(itemsErr.message || 'Could not save the destinations.'); return }
    setPlanOpen(false)
    fetchUnallocData()
  }
  async function togglePlan(p) {
    await supabase.from('unallocated_plans').update({ is_active: !p.is_active }).eq('id', p.id)
    fetchUnallocData()
  }

  async function handleSave(values) {
    await supabase.from('wallets').update(values).eq('id', id)
    setEditOpen(false)
    fetchAll()
  }

  if (loading) return <p className="text-ink-faint p-8">Loading...</p>
  if (!wallet)  return <p className="text-ink-faint p-8">Wallet not found.</p>

  // Spending bar for variable wallets — computed from already-fetched transactions
  const now          = new Date()
  const monthFrom    = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthTo      = format(endOfMonth(now),   'yyyy-MM-dd')
  const monthDebits  = wallet.type === 'variable'
    ? transactions
        .filter(t => t.type === 'debit' && t.date >= monthFrom && t.date <= monthTo)
        .reduce((s, t) => s + Number(t.amount), 0)
    : 0
  const budget       = Number(wallet.budget)
  const pct          = budget > 0 ? (monthDebits / budget) * 100 : 0
  const barColour    = pct >= 100 ? 'bg-negative-bar' : pct >= 75 ? 'bg-[#854F0B]' : 'bg-positive-bar'
  const textColour   = pct >= 100 ? 'text-negative' : pct >= 75 ? 'text-[#854F0B]' : 'text-positive'

  // Unallocated templates with affordability against the current balance (euro floor only;
  // percent items scale, so they add 0 to the floor). Affordable on top, unaffordable below.
  const unallocBalance = Number(wallet.balance)
  const templatesSorted = unallocTemplates
    .map(t => {
      const items = t.unallocated_template_items ?? []
      const floor = round2(items.filter(i => i.mode === 'euro').reduce((s, i) => s + Number(i.value), 0))
      return { ...t, items, floor, affordable: floor <= unallocBalance + 0.005 }
    })
    .sort((a, b) => (a.affordable === b.affordable ? 0 : a.affordable ? -1 : 1))

  // Unallocated History — derived from this wallet's own transactions (created_at desc).
  const unallocIncoming = transactions
    .filter(t => t.type === 'credit')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const unallocOutgoing = transactions
    .filter(t => t.type === 'debit')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // Live split validity for the plan form (mirrors the popup's running total).
  const planIsFixed      = planForm.distribute_mode === 'fixed_amount'
  const planTargetAmount = round2(Number(planForm.distribute_amount) || 0)
  const planEuroSum      = round2(planForm.items.reduce((s, it) => {
    const v = Number(it.value || 0)
    if (!v || v <= 0) return s
    return s + (it.mode === 'percent' ? (v / 100) * planTargetAmount : v)
  }, 0))
  const planPctSum       = round2(planForm.items.reduce((s, it) => s + (Number(it.value) > 0 ? Number(it.value) : 0), 0))
  const planRemaining    = round2(planTargetAmount - planEuroSum)
  const planSplitValid   = planIsFixed
    ? (planTargetAmount > 0 && Math.abs(planRemaining) < 0.005)
    : (Math.abs(100 - planPctSum) < 0.01)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/wallets')}
            className="p-2 text-ink-faint hover:text-ink-soft dark:hover:text-ink hover:bg-track rounded-lg transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[9px] bg-accent/10 flex items-center justify-center flex-shrink-0">
              <WalletIcon wallet={wallet} size={16} className="text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-medium text-ink">{wallet.name}</h1>
              <p className="text-ink-faint text-sm capitalize">
                {wallet.type === 'unallocated'
                  ? 'System wallet'
                  : `${wallet.type} · ${wallet.budget_type.replace('-', ' ')}${wallet.type !== 'investment' ? ` · ${formatMoney(Number(wallet.budget))}/mo` : ''}`
                }
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Compact spending bar — variable wallets only */}
          {wallet.type === 'variable' && (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-faint">{format(now, 'MMMM')} spending</span>
                <span className={`text-xs font-medium ml-2 ${textColour}`}>{pct.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-track rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${barColour}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-ink-faint">
                {formatMoney(monthDebits)} / {formatMoney(budget)}
              </p>
            </div>
          )}

          {/* Balance pill */}
          <div className={`px-4 py-1.5 rounded-full text-sm font-medium ${
            Number(wallet.balance) >= 0
              ? 'bg-positive-tint text-positive'
              : 'bg-negative-tint text-negative'
          }`}>
            Balance: {formatMoney(Number(wallet.balance))}
          </div>

          {!wallet.is_system && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ink-soft hover:bg-track rounded-lg transition-colors"
            >
              <Settings size={15} /> Settings
            </button>
          )}
        </div>
      </div>

      {/* ── Fixed wallet ──────────────────────────────────────────────────────── */}
      {wallet.type === 'fixed' && (
        <>
          <div className="flex gap-1 bg-track rounded-[14px] p-1 w-fit mb-6">
            {['overview', 'history'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'bg-card shadow-sm text-ink' : 'text-ink-muted hover:text-ink dark:hover:text-ink'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-card rounded-[14px] border border-card-border p-6">
                <TransactionChecklist walletId={id} onBalanceChanged={fetchAll} />
              </div>
              <div className="bg-card rounded-[14px] border border-card-border p-6">
                <UpcomingPayments rules={rules} transactions={transactions} />
              </div>
              <div className="bg-card rounded-[14px] border border-card-border p-6">
                <RecurringRules walletId={id} onRulesChanged={fetchAll} />
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="bg-card rounded-[14px] border border-card-border p-6">
              <PaymentHistory walletId={id} />
            </div>
          )}
        </>
      )}

      {/* ── Variable wallet ───────────────────────────────────────────────────── */}
      {wallet.type === 'variable' && (
        <>
          <div className="flex gap-1 bg-track rounded-[14px] p-1 w-fit mb-6">
            {['overview', 'history', 'trends'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'bg-card shadow-sm text-ink' : 'text-ink-muted hover:text-ink dark:hover:text-ink'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <VariableOverview
              walletId={id}
              onBalanceChanged={fetchAll}
            />
          )}

          {tab === 'history' && (
            <div className="bg-card rounded-[14px] border border-card-border p-6">
              <VariableHistory walletId={id} />
            </div>
          )}

          {tab === 'trends' && (
            <WalletTrendsChart walletId={id} wallet={wallet} />
          )}
        </>
      )}

      {/* ── Investment wallet ─────────────────────────────────────────────────── */}
      {wallet.type === 'investment' && (
        <div className="bg-card rounded-[14px] border border-card-border p-6">
          <p className="text-ink-faint text-sm">Investment wallet features coming in Phase 7.</p>
        </div>
      )}

      {/* ── Unallocated wallet ────────────────────────────────────────────────── */}
      {wallet.type === 'unallocated' && (
        <div className="space-y-4">
          {/* Multi-plan conflict banner */}
          <UnallocatedConflictBanner
            refreshSignal={conflictRefresh}
            onChange={() => { fetchAll(); setConflictRefresh(c => c + 1) }}
          />

          {/* Header: available to distribute + what the wallet collects */}
          <div className="bg-card rounded-[14px] border border-card-border p-6">
            <p className="text-xs font-medium text-ink-faint uppercase tracking-wide mb-1">Available to distribute</p>
            <p className="text-3xl font-medium text-ink dark:text-ink">{formatMoney(Number(wallet.balance))}</p>
            <p className="text-sm text-ink-muted leading-relaxed mt-2">
              This wallet automatically collects unassigned income and overflow from capped wallets.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-track rounded-[14px] p-1 w-fit">
            {['overview', 'history'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'bg-card shadow-sm text-ink' : 'text-ink-muted hover:text-ink dark:hover:text-ink'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setOutboundPrefill(null); setDistributeError(null); setDistributeOpen(true) }}
                  disabled={Number(wallet.balance) <= 0}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    Number(wallet.balance) > 0
                      ? 'bg-ink text-cream hover:bg-track'
                      : 'bg-track text-ink-faint cursor-not-allowed'
                  }`}
                >
                  Distribute now
                </button>
                <button
                  onClick={openPlan}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-card-border text-ink hover:bg-track"
                >
                  New auto-plan
                </button>
              </div>

              {/* Templates */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-ink">Templates</h2>
                  <button
                    onClick={openCreate}
                    className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink dark:hover:text-ink"
                  >
                    <Plus size={14} /> Create template
                  </button>
                </div>

                {templatesSorted.length === 0 ? (
                  <div className="text-center py-10 text-ink-faint border border-dashed border-card-border rounded-[14px]">
                    <p className="text-sm font-medium">No templates yet</p>
                    <p className="text-xs mt-1">Save a reusable split to distribute from here</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templatesSorted.map(t => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className={`text-left rounded-[14px] p-4 transition-all ${
                          t.affordable
                            ? 'bg-card border border-card-border hover:border-ink-faint hover:shadow-sm'
                            : 'bg-track/40 border border-dashed border-card-border opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-ink text-sm truncate">{t.name}</p>
                          {!t.affordable && (
                            <span className="text-xs font-medium text-[#854F0B] whitespace-nowrap">
                              needs {formatMoney(t.floor - unallocBalance)} more
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                          {t.items.length === 0
                            ? 'No destinations'
                            : t.items
                                .map(i => `${walletName(i.wallet_id)} ${i.mode === 'percent' ? `${Number(i.value)}%` : formatMoney(Number(i.value))}`)
                                .join(' · ')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Automatic plans */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-ink">Automatic plans</h2>
                  <button
                    onClick={openPlan}
                    className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink dark:hover:text-ink"
                  >
                    <Plus size={14} /> New auto-plan
                  </button>
                </div>

                {unallocPlans.length === 0 ? (
                  <div className="text-center py-10 text-ink-faint border border-dashed border-card-border rounded-[14px]">
                    <p className="text-sm font-medium">No automatic plans yet</p>
                    <p className="text-xs mt-1">Auto-distribute when the balance crosses a threshold</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unallocPlans.map(p => (
                      <div
                        key={p.id}
                        className={`flex items-start justify-between gap-3 rounded-[14px] p-4 border ${
                          p.is_active
                            ? 'bg-card border-card-border'
                            : 'bg-track/40 border-card-border opacity-60'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-ink text-sm truncate">{p.name}</p>
                          <p className="text-xs text-ink-muted mt-1 leading-relaxed">{planTrigger(p)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                          <button
                            type="button"
                            onClick={() => openPlanEdit(p)}
                            className="p-1.5 text-ink-faint hover:text-ink dark:hover:text-ink rounded-lg transition-colors"
                            aria-label="Edit plan"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={p.is_active}
                            onClick={() => togglePlan(p)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                              p.is_active ? 'bg-accent-solid' : 'bg-track '
                            }`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-card rounded-full shadow transition-transform ${
                              p.is_active ? 'translate-x-5' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'history' && (
            <div className="space-y-4">
              {/* Incoming / Outgoing toggle */}
              <div className="flex gap-1 bg-track rounded-[14px] p-1 w-fit">
                {['incoming', 'outgoing'].map(v => (
                  <button key={v} onClick={() => setHistView(v)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                      histView === v ? 'bg-card shadow-sm text-ink' : 'text-ink-muted hover:text-ink dark:hover:text-ink'
                    }`}>
                    {v}
                  </button>
                ))}
              </div>

              <div className="bg-card rounded-[14px] border border-card-border p-6">
                {histView === 'incoming' ? (
                  unallocIncoming.length === 0 ? (
                    <p className="text-ink-faint text-sm">No incoming yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {unallocIncoming.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{t.note || 'Credit'}</p>
                            <p className="text-xs text-ink-faint">{format(new Date(t.date), 'dd MMM yyyy')}</p>
                          </div>
                          <span className="text-sm font-medium text-positive whitespace-nowrap">+{formatMoney(Number(t.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  unallocOutgoing.length === 0 ? (
                    <p className="text-ink-faint text-sm">No outgoing yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {unallocOutgoing.map(t => {
                        const lbl = outgoingLabel(t.note)
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {lbl.badge && (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                                    lbl.badge === 'Auto-plan'
                                      ? 'bg-[#FAEEDA] text-[#854F0B]'
                                      : 'bg-positive-tint text-positive'
                                  }`}>
                                    {lbl.badge}
                                  </span>
                                )}
                                <p className="text-sm font-medium text-ink truncate">{lbl.text}</p>
                              </div>
                              <p className="text-xs text-ink-faint mt-0.5">{format(new Date(t.date), 'dd MMM yyyy')}</p>
                            </div>
                            <span className="text-sm font-medium text-negative whitespace-nowrap">{formatMoney(-Number(t.amount))}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Outbound distribution popup — manual "Distribute now" */}
      {distributeError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md bg-negative-tint text-negative dark:text-negative text-sm px-4 py-2 rounded-lg shadow-lg border border-[#A32D2D]/20">
          {distributeError}
        </div>
      )}
      {distributeOpen && (
        <DistributionPopup
          outbound
          maxAmount={Number(wallet.balance)}
          totalAmount={0}
          strictMode={strictMode}
          existingRules={outboundPrefill?.existingRules ?? []}
          initialAmount={outboundPrefill?.initialAmount}
          onClose={() => { setDistributeOpen(false); setDistributeError(null); setOutboundPrefill(null) }}
          onConfirm={async (distributions) => {
            // All balance changes happen atomically inside the RPC — the client writes
            // no transaction rows and no balances itself.
            setDistributeError(null)
            const { data: newBalance, error } = await supabase.rpc('distribute_from_unallocated', {
              p_unallocated_wallet_id: wallet.id,
              p_distributions: distributions,
              p_note: outboundPrefill?.note ?? null,   // 'Template: X' when applying a template, else null (Manual)
              // p_date omitted → server uses today
            })
            if (error) {
              setDistributeError(error.message || 'Could not distribute. Nothing was changed.')
              return   // keep the popup open so the user can adjust and retry
            }
            setDistributeOpen(false)
            setOutboundPrefill(null)
            setWallet(w => (w ? { ...w, balance: newBalance } : w))   // optimistic from RPC return
            // Check-on-change: an outbound distribute changed the Unallocated balance.
            await evaluateUnallocatedPlans(wallet.id)
            fetchAll()                                                 // refresh transactions + balances (incl. any auto-fire)
            setConflictRefresh(c => c + 1)                             // re-check for a newly-stalled conflict
          }}
        />
      )}

      {/* Create unallocated template */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-card-border flex-shrink-0">
              <h2 className="text-lg font-medium text-ink">Create template</h2>
              <button onClick={() => setCreateOpen(false)} className="p-1.5 text-ink-faint hover:text-ink-soft dark:hover:text-ink rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              {createError && <p className="text-negative text-sm">{createError}</p>}

              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
                <input
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Monthly sweep"
                  className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-ink-soft">Destinations</label>
                  <button onClick={addCreateItem} className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink dark:hover:text-ink">
                    <Plus size={13} /> Add destination
                  </button>
                </div>
                <div className="space-y-2">
                  {createForm.items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={it.wallet_id}
                        onChange={e => updateCreateItem(idx, { wallet_id: e.target.value })}
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-card-border dark:border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      >
                        <option value="">Select wallet…</option>
                        {destWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      <div className="inline-flex bg-track rounded-lg p-0.5 flex-shrink-0">
                        {['euro', 'percent'].map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateCreateItem(idx, { mode: m })}
                            className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                              it.mode === m
                                ? 'bg-card shadow-sm text-ink dark:text-ink'
                                : 'text-ink-faint hover:text-ink-soft dark:hover:text-ink-faint'
                            }`}
                          >
                            {m === 'euro' ? '€' : '%'}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number" min="0" step="0.01"
                        value={it.value}
                        onChange={e => updateCreateItem(idx, { value: e.target.value })}
                        placeholder={it.mode === 'euro' ? '0.00' : '0'}
                        className="w-20 px-2 py-1.5 text-sm text-right border border-card-border dark:border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                      <button
                        onClick={() => removeCreateItem(idx)}
                        disabled={createForm.items.length === 1}
                        className="p-1.5 text-ink-faint hover:text-negative disabled:opacity-30 disabled:hover:text-ink-faint rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 pt-3 border-t border-card-border flex-shrink-0 flex gap-3">
              <button onClick={() => setCreateOpen(false)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
              <button onClick={saveTemplate} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:bg-track">Save template</button>
            </div>
          </div>
        </div>
      )}

      {/* Create automatic plan */}
      {planOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-card-border flex-shrink-0">
              <h2 className="text-lg font-medium text-ink">{planForm.isEdit ? 'Edit auto-plan' : 'New auto-plan'}</h2>
              <button onClick={() => setPlanOpen(false)} className="p-1.5 text-ink-faint hover:text-ink-soft dark:hover:text-ink rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              {planError && <p className="text-negative text-sm">{planError}</p>}

              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
                <input
                  value={planForm.name}
                  onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Auto-sweep to savings"
                  className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1">Threshold (€)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={planForm.threshold}
                    onChange={e => setPlanForm(f => ({ ...f, threshold: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1">Distribute</label>
                  <select
                    value={planForm.distribute_mode}
                    onChange={e => setPlanMode(e.target.value)}
                    className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                  >
                    {PLAN_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              {planForm.distribute_mode === 'fixed_amount' && (
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1">Fixed amount (€)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={planForm.distribute_amount}
                    onChange={e => setPlanForm(f => ({ ...f, distribute_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-ink-soft">Destinations</label>
                  <button onClick={addPlanItem} className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink dark:hover:text-ink">
                    <Plus size={13} /> Add destination
                  </button>
                </div>
                {!planIsFixed && (
                  <p className="text-xs text-ink-faint mb-2">This mode distributes a variable amount, so destinations are percentages that must total 100%.</p>
                )}
                <div className="space-y-2">
                  {planForm.items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={it.wallet_id}
                        onChange={e => updatePlanItem(idx, { wallet_id: e.target.value })}
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-card-border dark:border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      >
                        <option value="">Select wallet…</option>
                        {destWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      {planIsFixed ? (
                        <div className="inline-flex bg-track rounded-lg p-0.5 flex-shrink-0">
                          {['euro', 'percent'].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => updatePlanItem(idx, { mode: m, value: clampPlanValue(it.value, m) })}
                              className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                                it.mode === m
                                  ? 'bg-card shadow-sm text-ink dark:text-ink'
                                  : 'text-ink-faint hover:text-ink-soft dark:hover:text-ink-faint'
                              }`}
                            >
                              {m === 'euro' ? '€' : '%'}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium text-ink-muted flex-shrink-0">%</span>
                      )}
                      <input
                        type="number" min="0" step="0.01"
                        max={it.mode === 'percent' ? 100 : undefined}
                        value={it.value}
                        onChange={e => updatePlanItem(idx, { value: clampPlanValue(e.target.value, it.mode) })}
                        placeholder={it.mode === 'euro' ? '0.00' : '0'}
                        className="w-20 px-2 py-1.5 text-sm text-right border border-card-border dark:border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                      <button
                        onClick={() => removePlanItem(idx)}
                        disabled={planForm.items.length === 1}
                        className="p-1.5 text-ink-faint hover:text-negative disabled:opacity-30 disabled:hover:text-ink-faint rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 pt-3 border-t border-card-border flex-shrink-0 space-y-3">
              {/* Live split readout */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">{planIsFixed ? 'Allocated' : 'Total'}</span>
                {planIsFixed ? (
                  <span className={`font-medium ${planSplitValid ? 'text-positive' : planRemaining < 0 ? 'text-negative' : 'text-[#854F0B]'}`}>
                    {formatMoney(planEuroSum)} of {formatMoney(planTargetAmount)}
                    {!planSplitValid && planTargetAmount > 0 && (planRemaining >= 0
                      ? ` · ${formatMoney(planRemaining)} remaining`
                      : ` · over by ${formatMoney(Math.abs(planRemaining))}`)}
                  </span>
                ) : (
                  <span className={`font-medium ${planSplitValid ? 'text-positive' : 'text-[#854F0B]'}`}>
                    {planPctSum}% of 100%
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPlanOpen(false)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
                <button
                  onClick={savePlan}
                  disabled={!planSplitValid}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    planSplitValid
                      ? 'bg-ink text-cream hover:bg-track'
                      : 'bg-track text-ink-faint cursor-not-allowed'
                  }`}
                >
                  {planForm.isEdit ? 'Save changes' : 'Save plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <WalletModal
          wallet={wallet}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
