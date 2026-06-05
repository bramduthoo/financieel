import { useEffect, useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, TrendingUp, FileText, ChevronUp, ChevronDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { generateUpcomingDates } from '../lib/recurringUtils'
import IncomeConfirmModal from '../components/IncomeConfirmModal'
import SalaryGrowthChart from '../components/SalaryGrowthChart'

const FREQ_OPTIONS = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
]

const TYPE_BADGE = {
  manual:    'bg-blue-50 text-blue-600',
  recurring: 'bg-indigo-50 text-indigo-600',
  template:  'bg-violet-50 text-violet-600',
}

function fmt(n) { return `€${Number(n).toFixed(2)}` }
function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function buildChain(ruleId, allRules) {
  const chain = []
  let current = allRules.find(r => r.id === ruleId)
  while (current) {
    chain.push(current)
    if (!current.parent_rule_id) break
    current = allRules.find(r => r.id === current.parent_rule_id)
  }
  return chain.reverse()
}

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
  const [activeTab,  setActiveTab]  = useState('add')
  const [addMethod,  setAddMethod]  = useState('quick')

  const [entries,          setEntries]          = useState([])
  const [allRecurringRules, setAllRecurringRules] = useState([])
  const [templates,        setTemplates]        = useState([])
  const [loading,          setLoading]          = useState(true)

  const recurringRules = useMemo(
    () => allRecurringRules.filter(r => !r.end_date),
    [allRecurringRules]
  )

  // Confirmation modal state
  const [confirm, setConfirm] = useState(null)

  // Quick entry form
  const [quickForm,  setQuickForm]  = useState({ amount: '', source: '', date: todayStr(), note: '' })
  const [quickError, setQuickError] = useState(null)

  // Recurring form modal — null = closed
  const [recurringForm,  setRecurringForm]  = useState(null)
  const [recurringError, setRecurringError] = useState(null)

  // Template form modal — null = closed
  const [templateForm,  setTemplateForm]  = useState(null)
  const [templateError, setTemplateError] = useState(null)

  // Log income modal (for recurring / template "use" flow)
  const [logModal, setLogModal] = useState(null)

  // History filters / sort
  const [histSort,   setHistSort]   = useState({ field: 'date', dir: 'desc' })
  const [histFilter, setHistFilter] = useState({ sourceType: 'all', search: '' })
  const [histLimit,  setHistLimit]  = useState(10)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: e }, { data: r }, { data: t }] = await Promise.all([
      supabase.from('income_entries').select('*').order('date', { ascending: false }),
      supabase.from('income_recurring').select('*').order('start_date', { ascending: true }),
      supabase.from('income_templates').select('*').order('created_at', { ascending: true }),
    ])
    setEntries(e ?? [])
    setAllRecurringRules(r ?? [])
    setTemplates(t ?? [])
    setLoading(false)
  }

  // ─── Quick entry ───────────────────────────────────────────────────────────

  function submitQuick() {
    const { amount, source, date, note } = quickForm
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setQuickError('Enter a valid amount.'); return
    }
    if (!source.trim()) { setQuickError('Enter a source name.'); return }
    if (!date)          { setQuickError('Pick a date.'); return }
    setQuickError(null)
    setConfirm({
      title: 'Add income?',
      body: (
        <span>
          Add <strong>{fmt(amount)}</strong> from <strong>{source.trim()}</strong> on{' '}
          {format(parseISO(date), 'd MMM yyyy')}?
        </span>
      ),
      confirmLabel: 'Add income',
      variant: 'primary',
      onConfirm: async () => {
        await supabase.from('income_entries').insert({
          amount: Number(amount),
          source: source.trim(),
          date,
          note: note.trim() || null,
          source_type: 'manual',
        })
        setQuickForm({ amount: '', source: '', date: todayStr(), note: '' })
        setConfirm(null)
        fetchAll()
      },
    })
  }

  // ─── Recurring income ──────────────────────────────────────────────────────

  function openAddRecurring() {
    setRecurringError(null)
    setRecurringForm({
      isEdit: false, name: '', amount: '', frequency: 'monthly',
      day_of_month: '25', start_date: todayStr(),
    })
  }

  function openEditRecurring(rule) {
    setRecurringError(null)
    setRecurringForm({
      isEdit: true, id: rule.id, originalAmount: rule.amount,
      name: rule.name, amount: String(rule.amount),
      frequency: rule.frequency,
      day_of_month: String(rule.day_of_month ?? '1'),
      start_date: rule.start_date,
    })
  }

  function submitRecurringForm() {
    const f = recurringForm
    if (!f.name.trim())                                      { setRecurringError('Enter a name.'); return }
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) { setRecurringError('Enter a valid amount.'); return }
    if (!f.start_date && !f.isEdit)                          { setRecurringError('Pick a start date.'); return }
    setRecurringError(null)

    const amountChanged = f.isEdit && Number(f.amount) !== Number(f.originalAmount)
    const showDay = f.frequency === 'weekly' || f.frequency === 'monthly'

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
        const payload = {
          name: f.name.trim(),
          amount: Number(f.amount),
          frequency: f.frequency,
          day_of_month: showDay && f.day_of_month ? Number(f.day_of_month) : null,
        }
        if (f.isEdit && amountChanged) {
          await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', f.id)
          await supabase.from('income_recurring').insert({ ...payload, start_date: todayStr(), parent_rule_id: f.id })
        } else if (f.isEdit) {
          await supabase.from('income_recurring').update({ name: payload.name, frequency: payload.frequency, day_of_month: payload.day_of_month }).eq('id', f.id)
        } else {
          await supabase.from('income_recurring').insert({ ...payload, start_date: f.start_date })
        }
        setRecurringForm(null)
        setConfirm(null)
        fetchAll()
      },
    })
  }

  function archiveRecurring(rule) {
    setConfirm({
      title: 'Archive recurring income?',
      body: <span>Deactivate <strong>{rule.name}</strong>? Past entries are preserved.</span>,
      confirmLabel: 'Archive',
      variant: 'danger',
      onConfirm: async () => {
        await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', rule.id)
        setConfirm(null)
        fetchAll()
      },
    })
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  function openAddTemplate() {
    setTemplateError(null)
    setTemplateForm({ isEdit: false, name: '', amount: '', note: '' })
  }

  function openEditTemplate(t) {
    setTemplateError(null)
    setTemplateForm({ isEdit: true, id: t.id, name: t.name, amount: String(t.amount), note: t.note ?? '' })
  }

  function submitTemplateForm() {
    const f = templateForm
    if (!f.name.trim())                                        { setTemplateError('Enter a name.'); return }
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) { setTemplateError('Enter a valid amount.'); return }
    setTemplateError(null)

    setConfirm({
      title: f.isEdit ? 'Update template?' : 'Save template?',
      body: f.isEdit
        ? <span>Update <strong>{f.name}</strong> to <strong>{fmt(f.amount)}</strong>?</span>
        : <span>Save <strong>{f.name}</strong> as a template (<strong>{fmt(f.amount)}</strong>)?</span>,
      confirmLabel: f.isEdit ? 'Update' : 'Save',
      variant: 'primary',
      onConfirm: async () => {
        const payload = { name: f.name.trim(), amount: Number(f.amount), note: f.note.trim() || null }
        if (f.isEdit) {
          await supabase.from('income_templates').update(payload).eq('id', f.id)
        } else {
          await supabase.from('income_templates').insert(payload)
        }
        setTemplateForm(null)
        setConfirm(null)
        fetchAll()
      },
    })
  }

  function deleteTemplate(t) {
    setConfirm({
      title: 'Delete template?',
      body: <span>Permanently delete the <strong>{t.name}</strong> template? Past entries are not affected.</span>,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        await supabase.from('income_templates').delete().eq('id', t.id)
        setConfirm(null)
        fetchAll()
      },
    })
  }

  // ─── Log income modal ──────────────────────────────────────────────────────

  function openLogModal(type, source) {
    setLogModal({
      type,
      sourceName: source.name,
      amount: String(source.amount),
      date: todayStr(),
      ruleId:     type === 'recurring' ? source.id : null,
      templateId: type === 'template'  ? source.id : null,
      amountEditable: type === 'template',
    })
  }

  function submitLogModal() {
    const m = logModal
    if (!m.amount || isNaN(Number(m.amount)) || Number(m.amount) <= 0) return
    if (!m.date) return
    setConfirm({
      title: 'Log income?',
      body: (
        <span>
          Log <strong>{fmt(m.amount)}</strong> from <strong>{m.sourceName}</strong> on{' '}
          {format(parseISO(m.date), 'd MMM yyyy')}?
        </span>
      ),
      confirmLabel: 'Log income',
      variant: 'primary',
      onConfirm: async () => {
        await supabase.from('income_entries').insert({
          amount: Number(m.amount),
          source: m.sourceName,
          date: m.date,
          source_type: m.type,
          income_recurring_id: m.ruleId,
          income_template_id: m.templateId,
        })
        setLogModal(null)
        setConfirm(null)
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
      if (histSort.field === 'date')   { va = a.date;              vb = b.date }
      if (histSort.field === 'amount') { va = Number(a.amount);    vb = Number(b.amount) }
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
    if (histSort.field !== field) return <ChevronUp size={12} className="text-gray-300" />
    return histSort.dir === 'asc'
      ? <ChevronUp size={12} className="text-indigo-500" />
      : <ChevronDown size={12} className="text-indigo-500" />
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Income</h1>
        <p className="text-gray-500 text-sm mt-1">Track income from all sources</p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-8">
        {[['add', 'Add Income'], ['history', 'History']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══ Add Income tab ══════════════════════════════════════════════════════ */}
      {activeTab === 'add' && (
        <div>
          {/* Method selector */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
            {[['quick', 'Quick Entry'], ['recurring', 'Recurring'], ['template', 'Templates']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setAddMethod(id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  addMethod === id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Quick Entry ── */}
          {addMethod === 'quick' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-xl">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">One-off income</h2>
              {quickError && <p className="text-red-500 text-sm mb-3">{quickError}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
                  <input
                    type="number" value={quickForm.amount}
                    onChange={e => setQuickForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source name</label>
                  <input
                    value={quickForm.source}
                    onChange={e => setQuickForm(f => ({ ...f, source: e.target.value }))}
                    placeholder="e.g. Bonus"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <input
                    type="date" value={quickForm.date}
                    onChange={e => setQuickForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                  <input
                    value={quickForm.note}
                    onChange={e => setQuickForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Optional note"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <button
                onClick={submitQuick}
                className="mt-4 flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Plus size={15} />
                Add income
              </button>
            </div>
          )}

          {/* ── Recurring ── */}
          {addMethod === 'recurring' && (
            <div>
              <button
                onClick={openAddRecurring}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors mb-5"
              >
                <Plus size={15} />
                Add recurring source
              </button>

              {loading ? (
                <p className="text-gray-400 text-sm">Loading...</p>
              ) : recurringRules.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <TrendingUp size={36} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No recurring income sources</p>
                  <p className="text-sm mt-1">Add a salary or regular income above</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recurringRules.map(rule => {
                    const chain = buildChain(rule.id, allRecurringRules)
                    return (
                      <div key={rule.id} className="bg-white border border-gray-200 rounded-xl p-5">
                        <div className="flex items-start justify-between">
                          <p className="font-semibold text-gray-800 text-sm leading-tight">{rule.name}</p>
                          <div className="flex gap-1 ml-2 shrink-0">
                            <button
                              onClick={() => openEditRecurring(rule)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => archiveRecurring(rule)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xl font-bold text-gray-900 mt-2">{fmt(rule.amount)}</p>
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">
                          {rule.frequency} · next: {getNextDue(rule)}
                        </p>
                        <button
                          onClick={() => openLogModal('recurring', rule)}
                          className="mt-3 w-full py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors"
                        >
                          Log now
                        </button>
                        <SalaryGrowthChart chain={chain} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Templates ── */}
          {addMethod === 'template' && (
            <div>
              <button
                onClick={openAddTemplate}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors mb-5"
              >
                <Plus size={15} />
                Add template
              </button>

              {loading ? (
                <p className="text-gray-400 text-sm">Loading...</p>
              ) : templates.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <FileText size={36} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No templates yet</p>
                  <p className="text-sm mt-1">Save a template to log recurring amounts quickly</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map(t => (
                    <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-5">
                      <div className="flex items-start justify-between">
                        <p className="font-semibold text-gray-800 text-sm leading-tight">{t.name}</p>
                        <div className="flex gap-1 ml-2 shrink-0">
                          <button
                            onClick={() => openEditTemplate(t)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => deleteTemplate(t)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xl font-bold text-gray-900 mt-2">{fmt(t.amount)}</p>
                      {t.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{t.note}</p>}
                      <button
                        onClick={() => openLogModal('template', t)}
                        className="mt-3 w-full py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors"
                      >
                        Use template
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ History tab ═════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <select
              value={histFilter.sourceType}
              onChange={e => setHistFilter(f => ({ ...f, sourceType: e.target.value }))}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
            />
            <div className="ml-auto">
              <select
                value={histLimit === 'all' ? 'all' : histLimit}
                onChange={e => setHistLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={10}>Show 10</option>
                <option value={25}>Show 25</option>
                <option value={50}>Show 50</option>
                <option value="all">Show all</option>
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left">
                      <button
                        onClick={() => toggleSort('date')}
                        className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700"
                      >
                        Date <SortIcon field="date" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button
                        onClick={() => toggleSort('source')}
                        className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700"
                      >
                        Source <SortIcon field="source" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleSort('amount')}
                        className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 ml-auto"
                      >
                        Amount <SortIcon field="amount" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Note
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                        No entries found
                      </td>
                    </tr>
                  ) : displayedEntries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {format(parseISO(e.date), 'd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{e.source}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600 whitespace-nowrap">
                        +{fmt(e.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          TYPE_BADGE[e.source_type] ?? 'bg-gray-100 text-gray-500'
                        }`}>
                          {e.source_type ?? 'manual'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{e.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredEntries.length > displayedEntries.length && (
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                  Showing {displayedEntries.length} of {filteredEntries.length} entries
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ Log income modal ════════════════════════════════════════════════════ */}
      {logModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Log income</h2>
              <button onClick={() => setLogModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Source:{' '}
              <span className="font-medium text-gray-700">{logModal.sourceName}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
                <input
                  type="number"
                  value={logModal.amount}
                  onChange={e => setLogModal(m => ({ ...m, amount: e.target.value }))}
                  readOnly={!logModal.amountEditable}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    logModal.amountEditable
                      ? 'border-gray-300'
                      : 'border-gray-200 bg-gray-50 text-gray-500 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date"
                  value={logModal.date}
                  onChange={e => setLogModal(m => ({ ...m, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setLogModal(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitLogModal}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Recurring form modal ════════════════════════════════════════════════ */}
      {recurringForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">
                {recurringForm.isEdit ? 'Edit recurring income' : 'New recurring income'}
              </h2>
              <button onClick={() => setRecurringForm(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            {recurringError && <p className="text-red-500 text-sm mb-3">{recurringError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  value={recurringForm.name}
                  onChange={e => setRecurringForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Salary"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
                <input
                  type="number"
                  value={recurringForm.amount}
                  onChange={e => setRecurringForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {recurringForm.isEdit &&
                  recurringForm.amount &&
                  Number(recurringForm.amount) !== Number(recurringForm.originalAmount) && (
                    <p className="text-xs text-amber-600 mt-1">
                      Changing the amount will archive the current version.
                    </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                <select
                  value={recurringForm.frequency}
                  onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {FREQ_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {(recurringForm.frequency === 'weekly' || recurringForm.frequency === 'monthly') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {dayLabel(recurringForm.frequency)}
                  </label>
                  <input
                    type="number"
                    value={recurringForm.day_of_month}
                    onChange={e => setRecurringForm(f => ({ ...f, day_of_month: e.target.value }))}
                    min={1}
                    max={recurringForm.frequency === 'weekly' ? 7 : 31}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              {!recurringForm.isEdit && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                  <input
                    type="date"
                    value={recurringForm.start_date}
                    onChange={e => setRecurringForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setRecurringForm(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitRecurringForm}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                {recurringForm.isEdit ? 'Save changes' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Template form modal ═════════════════════════════════════════════════ */}
      {templateForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">
                {templateForm.isEdit ? 'Edit template' : 'New template'}
              </h2>
              <button onClick={() => setTemplateForm(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            {templateError && <p className="text-red-500 text-sm mb-3">{templateError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  value={templateForm.name}
                  onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Freelance invoice"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Default amount (€)</label>
                <input
                  type="number"
                  value={templateForm.amount}
                  onChange={e => setTemplateForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Default note (optional)</label>
                <input
                  value={templateForm.note}
                  onChange={e => setTemplateForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setTemplateForm(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitTemplateForm}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                {templateForm.isEdit ? 'Save changes' : 'Save'}
              </button>
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
    </div>
  )
}
