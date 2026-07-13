import { useEffect, useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, TrendingUp, FileText, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { generateUpcomingDates } from '../lib/recurringUtils'
import IncomeConfirmModal from '../components/IncomeConfirmModal'
import DistributionPopup from '../components/DistributionPopup'
import { distributeIncome } from '../lib/distributeIncome'
import { evaluateUnallocatedPlans } from '../lib/unallocatedPlans'
import { formatMoney, activeCurrencySymbol } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'

const FREQ_OPTIONS = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
]

const TYPE_BADGE = {
  manual:    'bg-track text-ink-soft',
  recurring: 'bg-[#FAEEDA] text-[#854F0B]',
  template:  'bg-positive-tint text-positive',
}

const inputClass = 'w-full px-3 py-2 border border-card-border rounded-[8px] text-sm bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30'

function fmt(n) { return formatMoney(n) }
function round2(n) { return Number(Number(n).toFixed(2)) }
function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function getNextDue(rule) {
  if (rule.frequency === 'quarterly') return 'every quarter'
  if (rule.frequency === 'yearly')    return 'every year'
  try {
    const dates = generateUpcomingDates(rule, new Date(), 1)
    return dates[0] ? format(dates[0], 'd MMM yyyy') : '—'
  } catch {
    return '—'
  }
}

function dayLabel(frequency) {
  if (frequency === 'weekly')  return 'Day of week (1 = Mon, 7 = Sun)'
  if (frequency === 'monthly') return 'Day of month (1–31)'
  return 'Day of month'
}

export default function Income() {
  const navigate = useNavigate()

  const [entries,           setEntries]          = useState([])
  const [allRecurringRules, setAllRecurringRules] = useState([])
  const [templates,         setTemplates]        = useState([])
  const [loading,           setLoading]          = useState(true)

  const recurringRules = useMemo(
    () => allRecurringRules.filter(r => !r.end_date),
    [allRecurringRules]
  )

  // modal: null | { tab: 'quick'|'recurring'|'template', editEntry?, editRule?, editTemplate? }
  const [modal,       setModal]       = useState(null)
  const [detailEntry, setDetailEntry] = useState(null)
  const [detailDist,  setDetailDist]  = useState(null)   // null = loading; { available, rows:[{wallet_id,name,colour,amount}], total }
  const [editDist,      setEditDist]      = useState(null)   // null | { entry, existingRules }
  const [editDistError, setEditDistError] = useState(null)
  const [logTemplate, setLogTemplate] = useState(null)
  const [confirm,     setConfirm]     = useState(null)

  const [quickForm,  setQuickForm]  = useState({ amount: '', source: '', date: todayStr(), note: '' })
  const [quickError, setQuickError] = useState(null)

  const [recurringForm,  setRecurringForm]  = useState({ isEdit: false, name: '', amount: '', frequency: 'monthly', day_of_month: '25', start_date: todayStr() })
  const [recurringError, setRecurringError] = useState(null)

  const [templateForm,  setTemplateForm]  = useState({ isEdit: false, name: '', amount: '', note: '' })
  const [templateError, setTemplateError] = useState(null)
  // Optional distribution set up within the manual template form.
  const [templateDist,     setTemplateDist]     = useState(null)   // null | { rows: [{wallet_id, mode, value}], sendRemainder }
  const [templateDistOpen, setTemplateDistOpen] = useState(false)

  const [histSort,   setHistSort]   = useState({ field: 'date', dir: 'desc' })
  const [histFilter, setHistFilter] = useState({ sourceType: 'all', search: '' })
  const [histLimit,  setHistLimit]  = useState(10)

  const [allWallets,         setAllWallets]         = useState([])
  const [strictMode,         setStrictMode]         = useState(true)
  const [unallocatedWalletId, setUnallocatedWalletId] = useState(null)
  const [distributionState,  setDistributionState]  = useState(null)

  useEffect(() => { fetchAll() }, [])

  // Compute the actual distribution (summed credit transactions) for an entry.
  async function fetchEntryDist(entryId) {
    const { data } = await supabase
      .from('transactions')
      .select('wallet_id, amount, wallets(name, icon, type)')
      .eq('income_entry_id', entryId)
      .eq('type', 'credit')
    const map = {}
    for (const t of data ?? []) {
      if (!map[t.wallet_id]) {
        map[t.wallet_id] = { wallet_id: t.wallet_id, name: t.wallets?.name ?? '—', icon: t.wallets?.icon, type: t.wallets?.type, amount: 0 }
      }
      map[t.wallet_id].amount += Number(t.amount)
    }
    const rows  = Object.values(map).map(r => ({ ...r, amount: round2(r.amount) }))
    const total = round2(rows.reduce((s, r) => s + r.amount, 0))
    return { available: rows.length > 0, rows, total }
  }

  // Load the distribution for the opened entry.
  useEffect(() => {
    if (!detailEntry) { setDetailDist(null); return }
    let cancelled = false
    setDetailDist(null)
    fetchEntryDist(detailEntry.id).then(d => { if (!cancelled) setDetailDist(d) })
    return () => { cancelled = true }
  }, [detailEntry])

  function openEditDist() {
    if (!detailEntry || !detailDist?.available) return
    setEditDistError(null)
    setEditDist({
      entry: detailEntry,
      existingRules: detailDist.rows.map(r => ({ wallet_id: r.wallet_id, mode: 'euro', value: r.amount })),
    })
  }

  async function fetchAll() {
    setLoading(true)
    const [{ data: e }, { data: r }, { data: t }, { data: w }, { data: s }, { data: ua }] = await Promise.all([
      supabase.from('income_entries').select('*').order('date', { ascending: false }),
      supabase.from('income_recurring').select('*').order('start_date', { ascending: true }),
      supabase.from('income_templates').select('*').order('created_at', { ascending: true }),
      supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('settings').select('strict_distribution').single(),
      supabase.from('wallets').select('id').eq('is_system', true).single(),
    ])
    setEntries(e ?? [])
    setAllRecurringRules(r ?? [])
    setTemplates(t ?? [])
    setAllWallets(w ?? [])
    setStrictMode(s?.strict_distribution ?? true)
    setUnallocatedWalletId(ua?.id ?? null)
    setLoading(false)
  }

  // ─── Modal helpers ─────────────────────────────────────────────────────────

  function openModal(tab, opts = {}) {
    setQuickError(null)
    setRecurringError(null)
    setTemplateError(null)

    if (tab === 'quick') {
      if (opts.editEntry) {
        const e = opts.editEntry
        setQuickForm({ amount: String(e.amount), source: e.source, date: e.date, note: e.note ?? '' })
      } else {
        setQuickForm({ amount: '', source: '', date: todayStr(), note: '' })
      }
    }

    if (tab === 'recurring') {
      if (opts.editRule) {
        const r = opts.editRule
        setRecurringForm({
          isEdit: true, id: r.id, originalAmount: r.amount,
          name: r.name, amount: String(r.amount),
          frequency: r.frequency,
          day_of_month: String(r.day_of_month ?? '1'),
          start_date: r.start_date,
        })
      } else {
        setRecurringForm({ isEdit: false, name: '', amount: '', frequency: 'monthly', day_of_month: '25', start_date: todayStr() })
      }
    }

    if (tab === 'template') {
      if (opts.editTemplate) {
        const t = opts.editTemplate
        setTemplateForm({ isEdit: true, id: t.id, name: t.name, amount: String(t.amount), note: t.note ?? '' })
        loadTemplateDist(t)
      } else {
        setTemplateForm({ isEdit: false, name: '', amount: '', note: '' })
        setTemplateDist(null)
      }
    }

    setModal({ tab, ...opts })
  }

  function closeModal() { setModal(null) }

  // ─── Quick entry ───────────────────────────────────────────────────────────

  function submitQuick() {
    const { amount, source, date, note } = quickForm
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { setQuickError('Enter a valid amount.'); return }
    if (!source.trim()) { setQuickError('Enter a source name.'); return }
    if (!date)          { setQuickError('Pick a date.'); return }
    setQuickError(null)

    const isEdit = !!modal?.editEntry
    const entry  = modal?.editEntry

    setConfirm({
      title: isEdit ? 'Update income entry?' : 'Add income?',
      body: (
        <span>
          {isEdit ? 'Update to ' : 'Add '}<strong>{fmt(amount)}</strong> from <strong>{source.trim()}</strong> on{' '}
          {format(parseISO(date), 'd MMM yyyy')}?
        </span>
      ),
      confirmLabel: isEdit ? 'Update' : 'Add income',
      variant: 'primary',
      onConfirm: async () => {
        const userId = await getCurrentUserId()
        if (isEdit) {
          // KNOWN PRE-EXISTING ISSUE (flagged, intentionally not fixed here):
          // Editing the amount here updates only the income_entries row — it does NOT
          // re-run distribution, so the wallet credits no longer sum to the new amount,
          // leaving the income and its distribution desynced. Follow-up: route amount
          // changes on a distributed income through the distribution editor (which
          // reverses + reapplies credits via the transactional RPC) so they can't desync.
          await supabase.from('income_entries').update({
            amount: Number(amount), source: source.trim(), date, note: note.trim() || null,
          }).eq('id', entry.id)
          setConfirm(null)
          closeModal()
          setDetailEntry(null)
          fetchAll()
        } else {
          const { data: ent } = await supabase.from('income_entries').insert({
            amount: Number(amount), source: source.trim(), date,
            note: note.trim() || null, source_type: 'manual', user_id: userId,
          }).select().single()
          setConfirm(null)
          closeModal()
          setDistributionState({ mode: 'income', totalAmount: Number(amount), sourceName: source.trim(), date, fromQuick: true, note: note.trim() || null, incomeEntryId: ent?.id ?? null })
          fetchAll()
        }
      },
    })
  }

  // ─── Recurring ─────────────────────────────────────────────────────────────

  function submitRecurring() {
    const f = recurringForm
    if (!f.name.trim())                                              { setRecurringError('Enter a name.'); return }
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) { setRecurringError('Enter a valid amount.'); return }
    if (!f.start_date && !f.isEdit)                                  { setRecurringError('Pick a start date.'); return }
    setRecurringError(null)

    const amountChanged = f.isEdit && Number(f.amount) !== Number(f.originalAmount)
    const showDay       = f.frequency === 'weekly' || f.frequency === 'monthly'

    const title = f.isEdit
      ? (amountChanged ? 'Archive & update amount?' : 'Update recurring income?')
      : 'Save recurring income?'

    const body = amountChanged
      ? <span>Change <strong>{f.name}</strong> from <strong>{fmt(f.originalAmount)}</strong> to <strong>{fmt(f.amount)}</strong>. The current version will be archived.</span>
      : f.isEdit
        ? <span>Update <strong>{f.name}</strong> ({fmt(f.amount)}, {f.frequency})?</span>
        : <span>Save <strong>{f.name}</strong> as recurring income: <strong>{fmt(f.amount)}</strong> / {f.frequency}?</span>

    setConfirm({
      title, body, variant: 'primary',
      confirmLabel: f.isEdit ? 'Save changes' : 'Save',
      onConfirm: async () => {
        const userId = await getCurrentUserId()
        const payload = {
          name: f.name.trim(), amount: Number(f.amount),
          frequency: f.frequency,
          day_of_month: showDay && f.day_of_month ? Number(f.day_of_month) : null,
        }
        if (f.isEdit && amountChanged) {
          await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', f.id)
          const { data: newRule } = await supabase.from('income_recurring').insert({ ...payload, start_date: todayStr(), parent_rule_id: f.id, user_id: userId }).select().single()
          setConfirm(null)
          closeModal()
          fetchAll()
          if (newRule) setDistributionState({ mode: 'recurringSetup', ruleId: newRule.id, ruleName: payload.name, ruleAmount: Number(f.amount) })
        } else if (f.isEdit) {
          await supabase.from('income_recurring').update({ name: payload.name, frequency: payload.frequency, day_of_month: payload.day_of_month }).eq('id', f.id)
          setConfirm(null)
          closeModal()
          fetchAll()
        } else {
          const { data: newRule } = await supabase.from('income_recurring').insert({ ...payload, start_date: f.start_date, user_id: userId }).select().single()
          setConfirm(null)
          closeModal()
          fetchAll()
          if (newRule) setDistributionState({ mode: 'recurringSetup', ruleId: newRule.id, ruleName: payload.name, ruleAmount: Number(f.amount) })
        }
      },
    })
  }

  function archiveRecurring(rule) {
    setConfirm({
      title: 'Archive recurring income?',
      body: <span>Deactivate <strong>{rule.name}</strong>? Past entries are preserved.</span>,
      confirmLabel: 'Archive', variant: 'danger',
      onConfirm: async () => {
        await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', rule.id)
        setConfirm(null)
        fetchAll()
      },
    })
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  async function loadTemplateDist(t) {
    const { data: items } = await supabase
      .from('income_template_distribution_items')
      .select('*')
      .eq('income_template_id', t.id)
    setTemplateDist({
      rows: (items ?? []).map(i => ({ wallet_id: i.wallet_id, mode: i.mode, value: Number(i.value) })),
      sendRemainder: !!t.send_remainder,
    })
  }

  function submitTemplate() {
    const f = templateForm
    if (!f.name.trim())                                                { setTemplateError('Enter a name.'); return }
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) { setTemplateError('Enter a valid amount.'); return }
    setTemplateError(null)

    const distRows  = (templateDist?.rows ?? []).filter(r => Number(r.value) > 0)
    const sendRem   = templateDist?.sendRemainder ?? false

    setConfirm({
      title: f.isEdit ? 'Update template?' : 'Save template?',
      body: f.isEdit
        ? <span>Update <strong>{f.name}</strong> to <strong>{fmt(f.amount)}</strong>?</span>
        : <span>Save <strong>{f.name}</strong> as a template (<strong>{fmt(f.amount)}</strong>)?</span>,
      confirmLabel: f.isEdit ? 'Update' : 'Save', variant: 'primary',
      onConfirm: async () => {
        const userId = await getCurrentUserId()
        const payload = { name: f.name.trim(), amount: Number(f.amount), note: f.note.trim() || null, send_remainder: sendRem }
        let templateId = f.id
        if (f.isEdit) {
          await supabase.from('income_templates').update(payload).eq('id', f.id)
          await supabase.from('income_template_distribution_items').delete().eq('income_template_id', f.id)
        } else {
          const { data: tpl } = await supabase.from('income_templates').insert({ ...payload, user_id: userId }).select().single()
          templateId = tpl?.id
        }
        if (templateId && distRows.length > 0) {
          await supabase.from('income_template_distribution_items').insert(
            distRows.map(r => ({
              income_template_id: templateId,
              wallet_id: r.wallet_id,
              mode: r.mode,
              value: Number(Number(r.value).toFixed(2)),   // stored as entered — percent stays percent
              user_id: userId,
            }))
          )
        }
        setConfirm(null)
        closeModal()
        fetchAll()
      },
    })
  }

  function deleteTemplate(t) {
    setConfirm({
      title: 'Delete template?',
      body: <span>Permanently delete the <strong>{t.name}</strong> template? Past entries are not affected.</span>,
      confirmLabel: 'Delete', variant: 'danger',
      onConfirm: async () => {
        await supabase.from('income_templates').delete().eq('id', t.id)
        setConfirm(null)
        fetchAll()
      },
    })
  }

  // ─── Log template ──────────────────────────────────────────────────────────

  function submitLogTemplate() {
    const { template, amount, date } = logTemplate
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return
    if (!date) return
    setConfirm({
      title: 'Log income?',
      body: (
        <span>
          Log <strong>{fmt(amount)}</strong> from <strong>{template.name}</strong> on{' '}
          {format(parseISO(date), 'd MMM yyyy')}?
        </span>
      ),
      confirmLabel: 'Log income', variant: 'primary',
      onConfirm: async () => {
        const userId = await getCurrentUserId()
        const { data: ent } = await supabase.from('income_entries').insert({
          amount: Number(amount), source: template.name, date,
          source_type: 'template', income_template_id: template.id, user_id: userId,
        }).select().single()
        // Prefill the distribution from the template's saved items + remainder flag.
        const { data: items } = await supabase
          .from('income_template_distribution_items')
          .select('*')
          .eq('income_template_id', template.id)
        const existingRules = (items ?? []).map(i => ({ wallet_id: i.wallet_id, mode: i.mode, value: Number(i.value) }))
        setLogTemplate(null)
        setConfirm(null)
        setDistributionState({
          mode: 'income', totalAmount: Number(amount), sourceName: template.name, date,
          existingRules, initialSendRemainder: !!template.send_remainder, incomeEntryId: ent?.id ?? null,
        })
        fetchAll()
      },
    })
  }

  // ─── History ───────────────────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let list = [...entries]
    if (histFilter.sourceType !== 'all')
      list = list.filter(e => e.source_type === histFilter.sourceType)
    if (histFilter.search)
      list = list.filter(e => e.source?.toLowerCase().includes(histFilter.search.toLowerCase()))
    list.sort((a, b) => {
      let va, vb
      if (histSort.field === 'date')   { va = a.date;                  vb = b.date }
      if (histSort.field === 'amount') { va = Number(a.amount);        vb = Number(b.amount) }
      if (histSort.field === 'source') { va = a.source?.toLowerCase(); vb = b.source?.toLowerCase() }
      if (va < vb) return histSort.dir === 'asc' ? -1 : 1
      if (va > vb) return histSort.dir === 'asc' ?  1 : -1
      return 0
    })
    return list
  }, [entries, histFilter, histSort])

  const displayedEntries = histLimit === 'all'
    ? filteredEntries
    : filteredEntries.slice(0, histLimit)

  function toggleSort(field) {
    setHistSort(s =>
      s.field === field
        ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'desc' }
    )
  }

  function SortIcon({ field }) {
    if (histSort.field !== field) return <ChevronUp size={12} className="text-ink-faint" />
    return histSort.dir === 'asc'
      ? <ChevronUp size={12} className="text-ink" />
      : <ChevronDown size={12} className="text-ink" />
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-medium text-ink">Income</h1>
          <p className="text-ink-muted text-sm mt-1">Track income from all sources</p>
        </div>
        <button
          onClick={() => openModal('quick')}
          className="flex items-center gap-2 bg-ink text-cream px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
        >
          <Plus size={15} />
          Add Income
        </button>
      </div>

      {/* History table */}
      {loading ? (
        <p className="text-ink-faint text-sm mb-8">Loading…</p>
      ) : (
        <div className="mb-8">
          <div className="flex flex-wrap gap-3 mb-3 items-center">
            <select
              value={histFilter.sourceType}
              onChange={e => setHistFilter(f => ({ ...f, sourceType: e.target.value }))}
              className="px-3 py-1.5 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
            >
              <option value="all">All types</option>
              <option value="manual">Manual</option>
              <option value="recurring">Recurring</option>
              <option value="template">Template</option>
            </select>
            <input
              value={histFilter.search}
              onChange={e => setHistFilter(f => ({ ...f, search: e.target.value }))}
              placeholder="Search source…"
              className="px-3 py-1.5 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 min-w-[160px] bg-field text-ink"
            />
            <div className="ml-auto">
              <select
                value={histLimit === 'all' ? 'all' : histLimit}
                onChange={e => setHistLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-3 py-1.5 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
              >
                <option value={10}>Show 10</option>
                <option value={25}>Show 25</option>
                <option value={50}>Show 50</option>
                <option value="all">Show all</option>
              </select>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-[14px] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-inner-border bg-track">
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => toggleSort('date')} className="flex items-center gap-1 text-xs font-medium text-ink-muted uppercase tracking-wide hover:text-ink dark:hover:text-ink">
                      Date <SortIcon field="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => toggleSort('source')} className="flex items-center gap-1 text-xs font-medium text-ink-muted uppercase tracking-wide hover:text-ink dark:hover:text-ink">
                      Source <SortIcon field="source" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 text-xs font-medium text-ink-muted uppercase tracking-wide hover:text-ink dark:hover:text-ink ml-auto">
                      Amount <SortIcon field="amount" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inner-border">
                {displayedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-ink-faint">No entries found</td>
                  </tr>
                ) : displayedEntries.map(e => (
                  <tr
                    key={e.id}
                    onClick={() => setDetailEntry(e)}
                    className="hover:bg-track transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{format(parseISO(e.date), 'd MMM yyyy')}</td>
                    <td className="px-4 py-3 font-medium text-ink">{e.source}</td>
                    <td className="px-4 py-3 text-right font-medium text-positive whitespace-nowrap">+{fmt(e.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_BADGE[e.source_type] ?? 'bg-track text-ink-muted'}`}>
                        {e.source_type ?? 'manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-faint text-xs">{e.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEntries.length > displayedEntries.length && (
              <p className="px-4 py-2 text-xs text-ink-faint border-t border-inner-border">
                Showing {displayedEntries.length} of {filteredEntries.length} entries
              </p>
            )}
          </div>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Recurring incomes */}
        <div className="bg-card border border-card-border rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">Recurring income</h2>
            <button
              onClick={() => openModal('recurring')}
              className="text-xs text-ink-soft hover:text-ink font-medium"
            >
              + Add
            </button>
          </div>

          {loading ? (
            <p className="text-ink-faint text-sm">Loading…</p>
          ) : recurringRules.length === 0 ? (
            <div className="text-center py-12 text-ink-faint border border-dashed border-card-border rounded-[14px]">
              <TrendingUp size={28} className="mx-auto mb-2 text-ink-faint dark:text-ink-soft" />
              <p className="text-sm font-medium">No recurring income</p>
              <p className="text-xs mt-1">Add a salary or regular source</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recurringRules.map(rule => (
                <div
                  key={rule.id}
                  onClick={() => navigate(`/income/recurring/${rule.id}`)}
                  className="bg-card border border-card-border rounded-[14px] p-4 cursor-pointer hover:border-ink-faint hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-ink text-sm truncate">{rule.name}</p>
                      <p className="text-xs text-ink-faint mt-0.5 capitalize">{rule.frequency} · next: {getNextDue(rule)}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); openModal('recurring', { editRule: rule }) }}
                        className="p-1.5 text-ink-faint hover:text-ink rounded-lg transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); archiveRecurring(rule) }}
                        className="p-1.5 text-ink-faint hover:text-ink rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                      <ChevronRight size={15} className="text-ink-faint ml-1" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xl font-medium text-ink dark:text-ink">{fmt(rule.amount)}</p>
                    <ChevronRight size={16} className="text-ink-faint dark:text-ink-soft" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Templates */}
        <div className="bg-card border border-card-border rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">Templates</h2>
            <button
              onClick={() => openModal('template')}
              className="text-xs text-ink-soft hover:text-ink font-medium"
            >
              + Add
            </button>
          </div>

          {loading ? (
            <p className="text-ink-faint text-sm">Loading…</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-ink-faint border border-dashed border-card-border rounded-[14px]">
              <FileText size={28} className="mx-auto mb-2 text-ink-faint dark:text-ink-soft" />
              <p className="text-sm font-medium">No templates</p>
              <p className="text-xs mt-1">Save amounts you log regularly</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => setLogTemplate({ template: t, amount: String(t.amount), date: todayStr() })}
                  className="bg-card border border-card-border rounded-[14px] p-4 cursor-pointer hover:border-ink-faint hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-ink text-sm truncate">{t.name}</p>
                      {t.note && <p className="text-xs text-ink-faint mt-0.5 truncate">{t.note}</p>}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); openModal('template', { editTemplate: t }) }}
                        className="p-1.5 text-ink-faint hover:text-ink hover:bg-accent/10 rounded-lg transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteTemplate(t) }}
                        className="p-1.5 text-ink-faint hover:text-negative hover:bg-negative-tint rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xl font-medium text-ink dark:text-ink mt-2">{fmt(t.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ Add Income modal ════════════════════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-inner-border">
              <h2 className="text-lg font-medium text-ink">
                {modal.editEntry ? 'Edit income entry' : 'Add Income'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-ink-faint hover:text-ink-soft dark:hover:text-ink rounded-lg">
                <X size={16} />
              </button>
            </div>

            {!modal.editEntry && (
              <div className="flex gap-1 bg-track p-1 mx-6 mt-4 rounded-[14px]">
                {[['quick', 'Quick Entry'], ['recurring', 'Recurring'], ['template', 'Template']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => openModal(id, {})}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      modal.tab === id ? 'bg-card shadow-sm text-ink' : 'text-ink-muted hover:text-ink dark:hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="px-6 pb-6 pt-4">
              {/* Quick Entry */}
              {modal.tab === 'quick' && (
                <div>
                  {quickError && <p className="text-negative text-sm mb-3">{quickError}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Amount ({activeCurrencySymbol()})</label>
                      <input
                        type="number" value={quickForm.amount}
                        onChange={e => setQuickForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Source name</label>
                      <input
                        value={quickForm.source}
                        onChange={e => setQuickForm(f => ({ ...f, source: e.target.value }))}
                        placeholder="e.g. Bonus"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Date</label>
                      <input
                        type="date" value={quickForm.date}
                        onChange={e => setQuickForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Note (optional)</label>
                      <input
                        value={quickForm.note}
                        onChange={e => setQuickForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="Optional note"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
                    <button onClick={submitQuick} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">
                      {modal.editEntry ? 'Update' : 'Add income'}
                    </button>
                  </div>
                </div>
              )}

              {/* Recurring */}
              {modal.tab === 'recurring' && (
                <div>
                  {recurringError && <p className="text-negative text-sm mb-3">{recurringError}</p>}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
                      <input
                        value={recurringForm.name}
                        onChange={e => setRecurringForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Salary"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Amount ({activeCurrencySymbol()})</label>
                      <input
                        type="number" value={recurringForm.amount}
                        onChange={e => setRecurringForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                      {recurringForm.isEdit && recurringForm.amount && Number(recurringForm.amount) !== Number(recurringForm.originalAmount) && (
                        <p className="text-xs text-[#854F0B] mt-1">Changing the amount will archive the current version.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Frequency</label>
                      <select
                        value={recurringForm.frequency}
                        onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value }))}
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      >
                        {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {(recurringForm.frequency === 'weekly' || recurringForm.frequency === 'monthly') && (
                      <div>
                        <label className="block text-xs font-medium text-ink-soft mb-1">{dayLabel(recurringForm.frequency)}</label>
                        <input
                          type="number" value={recurringForm.day_of_month}
                          onChange={e => setRecurringForm(f => ({ ...f, day_of_month: e.target.value }))}
                          min={1} max={recurringForm.frequency === 'weekly' ? 7 : 31}
                          className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                        />
                      </div>
                    )}
                    {!recurringForm.isEdit && (
                      <div>
                        <label className="block text-xs font-medium text-ink-soft mb-1">Start date</label>
                        <input
                          type="date" value={recurringForm.start_date}
                          onChange={e => setRecurringForm(f => ({ ...f, start_date: e.target.value }))}
                          className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
                    <button onClick={submitRecurring} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">
                      {recurringForm.isEdit ? 'Save changes' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* Template */}
              {modal.tab === 'template' && (
                <div>
                  {templateError && <p className="text-negative text-sm mb-3">{templateError}</p>}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
                      <input
                        value={templateForm.name}
                        onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Freelance invoice"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Default amount ({activeCurrencySymbol()})</label>
                      <input
                        type="number" value={templateForm.amount}
                        onChange={e => setTemplateForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Default note (optional)</label>
                      <input
                        value={templateForm.note}
                        onChange={e => setTemplateForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                      />
                    </div>
                    {/* Distribution (optional) */}
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">Distribution (optional)</label>
                      <div className="flex items-center justify-between gap-3 border border-card-border rounded-lg px-3 py-2">
                        <p className="text-xs text-ink-muted">
                          {templateDist?.rows?.length
                            ? `${templateDist.rows.length} wallet${templateDist.rows.length > 1 ? 's' : ''}${templateDist.sendRemainder ? ' · remainder → Unallocated' : ''}`
                            : 'No distribution set'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setTemplateDistOpen(true)}
                          disabled={!(Number(templateForm.amount) > 0)}
                          className={`text-xs font-medium whitespace-nowrap ${
                            Number(templateForm.amount) > 0
                              ? 'text-ink hover:text-accent'
                              : 'text-ink-faint dark:text-ink-soft cursor-not-allowed'
                          }`}
                        >
                          {templateDist?.rows?.length ? 'Edit distribution' : 'Set up distribution'}
                        </button>
                      </div>
                      {!(Number(templateForm.amount) > 0) && (
                        <p className="text-xs text-ink-faint mt-1">Enter an amount first to set up a distribution.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
                    <button onClick={submitTemplate} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">
                      {templateForm.isEdit ? 'Save changes' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Detail modal (row click) ════════════════════════════════════════════ */}
      {detailEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-ink">Income entry</h2>
              <button onClick={() => setDetailEntry(null)} className="p-1.5 text-ink-faint hover:text-ink-soft dark:hover:text-ink rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Source</span>
                <span className="font-medium text-ink">{detailEntry.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Amount</span>
                <span className="font-medium text-positive">+{fmt(detailEntry.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Date</span>
                <span className="text-ink">{format(parseISO(detailEntry.date), 'd MMM yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Type</span>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_BADGE[detailEntry.source_type] ?? 'bg-track text-ink-muted'}`}>
                  {detailEntry.source_type ?? 'manual'}
                </span>
              </div>
              {detailEntry.note && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Note</span>
                  <span className="text-ink text-right max-w-[60%]">{detailEntry.note}</span>
                </div>
              )}
            </div>

            {/* Distribution — derived from the credit transactions linked to this entry */}
            <div className="mt-4 pt-4 border-t border-inner-border">
              <p className="text-xs font-medium text-ink-faint uppercase tracking-wide mb-2">Distribution</p>
              {detailDist === null ? (
                <p className="text-sm text-ink-faint">Loading…</p>
              ) : !detailDist.available ? (
                <p className="text-sm text-ink-faint">Distribution details aren't available for this entry.</p>
              ) : (
                <div className="space-y-2">
                  {detailDist.rows.map(r => (
                      <div key={r.wallet_id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <WalletIcon wallet={r} size={14} className="text-ink-soft flex-shrink-0" />
                          <span className="text-ink truncate">{r.name}</span>
                        </div>
                        <span className="font-medium text-ink dark:text-ink">{fmt(r.amount)}</span>
                      </div>
                  ))}
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-inner-border">
                    <span className="text-ink-muted">Total</span>
                    <span className="font-medium text-ink dark:text-ink">{fmt(detailDist.total)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-3">
              {detailDist?.available && (
                <button
                  onClick={openEditDist}
                  className="w-full py-2 rounded-lg border border-card-border text-sm font-medium text-ink hover:bg-track"
                >
                  Edit distribution
                </button>
              )}
              <div className="flex gap-3">
                <button onClick={() => setDetailEntry(null)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Close</button>
                <button
                  onClick={() => {
                    const e = detailEntry
                    setDetailEntry(null)
                    openModal('quick', { editEntry: e })
                  }}
                  className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Log template modal ══════════════════════════════════════════════════ */}
      {logTemplate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-ink">Log income</h2>
              <button onClick={() => setLogTemplate(null)} className="p-1.5 text-ink-faint hover:text-ink-soft dark:hover:text-ink rounded-lg">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-ink-muted mb-4">
              Template: <span className="font-medium text-ink">{logTemplate.template.name}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Amount ({activeCurrencySymbol()})</label>
                <input
                  type="number" value={logTemplate.amount}
                  onChange={e => setLogTemplate(m => ({ ...m, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Date</label>
                <input
                  type="date" value={logTemplate.date}
                  onChange={e => setLogTemplate(m => ({ ...m, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setLogTemplate(null)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
              <button onClick={submitLogTemplate} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Confirmation modal ══════════════════════════════════════════════════ */}
      {confirm && (
        <IncomeConfirmModal
          title={confirm.title}
          body={confirm.body}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
        />
      )}

      {/* ══ Distribution popup — quick / template income ════════════════════════ */}
      {distributionState?.mode === 'income' && (
        <DistributionPopup
          totalAmount={distributionState.totalAmount}
          strictMode={strictMode}
          allowTemplates={distributionState.fromQuick === true}
          existingRules={distributionState.existingRules ?? []}
          initialSendRemainder={distributionState.initialSendRemainder}
          entryName={distributionState.sourceName}
          entryNote={distributionState.note ?? null}
          onSaved={fetchAll}
          onClose={() => setDistributionState(null)}
          onConfirm={async (distributions) => {
            const userId = await getCurrentUserId()
            // The popup already resolves every row to euros and appends the
            // Unallocated remainder sweep when its checkbox is checked.
            await distributeIncome({
              distributions,
              wallets: allWallets,
              unallocatedWalletId,
              sourceName: distributionState.sourceName,
              date: distributionState.date,
              isAutomated: false,
              userId,
              incomeEntryId: distributionState.incomeEntryId ?? null,
            })
            // Check-on-change: the distribution may have credited Unallocated.
            await evaluateUnallocatedPlans(unallocatedWalletId)
            setDistributionState(null)
          }}
        />
      )}

      {/* ══ Distribution popup — manual template distribution setup ══════════════ */}
      {templateDistOpen && (
        <DistributionPopup
          totalAmount={Number(templateForm.amount) || 0}
          strictMode={false}
          allowTemplates={false}
          existingRules={templateDist?.rows ?? []}
          initialSendRemainder={templateDist?.sendRemainder ?? false}
          onClose={() => setTemplateDistOpen(false)}
          onConfirm={(distributions, meta) => {
            setTemplateDist({
              rows: (meta?.rows ?? []).map(r => ({ wallet_id: r.wallet_id, mode: r.mode, value: r.value })),
              sendRemainder: !!meta?.sendRemainder,
            })
            setTemplateDistOpen(false)
          }}
        />
      )}

      {/* ══ Edit distribution of a logged income (atomic RPC) ════════════════════ */}
      {editDistError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md bg-negative-tint text-negative dark:text-negative text-sm px-4 py-2 rounded-lg shadow-lg border border-[#A32D2D]/20">
          {editDistError}
        </div>
      )}
      {editDist && (
        <DistributionPopup
          totalAmount={Number(editDist.entry.amount)}
          strictMode={strictMode}
          allowTemplates={false}
          existingRules={editDist.existingRules}
          onClose={() => { setEditDist(null); setEditDistError(null) }}
          onConfirm={async (distributions) => {
            // The popup's `distributions` already includes any remainder sweep and sums
            // to the entry amount. The RPC performs ALL balance changes atomically —
            // the client does no reverse/delete/reapply or balance math itself.
            setEditDistError(null)
            const entry = editDist.entry
            const { error } = await supabase.rpc('edit_income_distribution', {
              p_income_entry_id: entry.id,
              p_new_credits: distributions,
              p_source_name: entry.source,
              p_date: entry.date,
            })
            if (error) {
              setEditDistError(error.message || 'Could not update the distribution. Nothing was changed.')
              return   // keep the popup open so the user can adjust and retry
            }
            setEditDist(null)
            // Check-on-change: editing a distribution can change the Unallocated balance.
            await evaluateUnallocatedPlans(unallocatedWalletId)
            const d = await fetchEntryDist(entry.id)   // refresh the inspect view
            setDetailDist(d)
            fetchAll()                                  // refresh history + wallet balances
          }}
        />
      )}

      {/* ══ Distribution popup — new recurring income setup (mandatory) ═════════ */}
      {distributionState?.mode === 'recurringSetup' && (
        <DistributionPopup
          totalAmount={distributionState.ruleAmount}
          strictMode={true}
          onClose={null}
          onConfirm={async (distributions, meta) => {
            const ruleRows = meta?.allRows ?? []
            if (ruleRows.length > 0) {
              const userId = await getCurrentUserId()
              // Persist the user's %/€ intent (mode + value); keep amount in
              // sync with the resolved euro value for backward compatibility.
              await supabase.from('income_distribution_rules').insert(
                ruleRows.map((r, i) => ({
                  income_recurring_id: distributionState.ruleId,
                  wallet_id: r.wallet_id,
                  mode: r.mode,
                  value: r.value,
                  amount: r.amount,
                  priority: i,
                  user_id: userId,
                }))
              )
            }
            setDistributionState(null)
          }}
        />
      )}
    </div>
  )
}
