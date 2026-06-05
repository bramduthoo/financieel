import { useEffect, useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, TrendingUp, FileText, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateUpcomingDates } from '../lib/recurringUtils'
import IncomeConfirmModal from '../components/IncomeConfirmModal'

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
  const [logTemplate, setLogTemplate] = useState(null)
  const [confirm,     setConfirm]     = useState(null)

  const [quickForm,  setQuickForm]  = useState({ amount: '', source: '', date: todayStr(), note: '' })
  const [quickError, setQuickError] = useState(null)

  const [recurringForm,  setRecurringForm]  = useState({ isEdit: false, name: '', amount: '', frequency: 'monthly', day_of_month: '25', start_date: todayStr() })
  const [recurringError, setRecurringError] = useState(null)

  const [templateForm,  setTemplateForm]  = useState({ isEdit: false, name: '', amount: '', note: '' })
  const [templateError, setTemplateError] = useState(null)

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
      } else {
        setTemplateForm({ isEdit: false, name: '', amount: '', note: '' })
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
        if (isEdit) {
          await supabase.from('income_entries').update({
            amount: Number(amount), source: source.trim(), date, note: note.trim() || null,
          }).eq('id', entry.id)
        } else {
          await supabase.from('income_entries').insert({
            amount: Number(amount), source: source.trim(), date,
            note: note.trim() || null, source_type: 'manual',
          })
        }
        setConfirm(null)
        closeModal()
        setDetailEntry(null)
        fetchAll()
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
        const payload = {
          name: f.name.trim(), amount: Number(f.amount),
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
        setConfirm(null)
        closeModal()
        fetchAll()
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

  function submitTemplate() {
    const f = templateForm
    if (!f.name.trim())                                                { setTemplateError('Enter a name.'); return }
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) { setTemplateError('Enter a valid amount.'); return }
    setTemplateError(null)

    setConfirm({
      title: f.isEdit ? 'Update template?' : 'Save template?',
      body: f.isEdit
        ? <span>Update <strong>{f.name}</strong> to <strong>{fmt(f.amount)}</strong>?</span>
        : <span>Save <strong>{f.name}</strong> as a template (<strong>{fmt(f.amount)}</strong>)?</span>,
      confirmLabel: f.isEdit ? 'Update' : 'Save', variant: 'primary',
      onConfirm: async () => {
        const payload = { name: f.name.trim(), amount: Number(f.amount), note: f.note.trim() || null }
        if (f.isEdit) {
          await supabase.from('income_templates').update(payload).eq('id', f.id)
        } else {
          await supabase.from('income_templates').insert(payload)
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
        await supabase.from('income_entries').insert({
          amount: Number(amount), source: template.name, date,
          source_type: 'template', income_template_id: template.id,
        })
        setLogTemplate(null)
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
    if (histSort.field !== field) return <ChevronUp size={12} className="text-gray-300" />
    return histSort.dir === 'asc'
      ? <ChevronUp size={12} className="text-indigo-500" />
      : <ChevronDown size={12} className="text-indigo-500" />
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Income</h1>
          <p className="text-gray-500 text-sm mt-1">Track income from all sources</p>
        </div>
        <button
          onClick={() => openModal('quick')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus size={15} />
          Add Income
        </button>
      </div>

      {/* History table */}
      {loading ? (
        <p className="text-gray-400 text-sm mb-8">Loading…</p>
      ) : (
        <div className="mb-8">
          <div className="flex flex-wrap gap-3 mb-3 items-center">
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

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => toggleSort('date')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
                      Date <SortIcon field="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => toggleSort('source')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
                      Source <SortIcon field="source" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 ml-auto">
                      Amount <SortIcon field="amount" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">No entries found</td>
                  </tr>
                ) : displayedEntries.map(e => (
                  <tr
                    key={e.id}
                    onClick={() => setDetailEntry(e)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{format(parseISO(e.date), 'd MMM yyyy')}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{e.source}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600 whitespace-nowrap">+{fmt(e.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_BADGE[e.source_type] ?? 'bg-gray-100 text-gray-500'}`}>
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
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recurring income */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Recurring income</h2>
            <button
              onClick={() => openModal('recurring')}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <Plus size={13} /> Add
            </button>
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : recurringRules.length === 0 ? (
            <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <TrendingUp size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium">No recurring income</p>
              <p className="text-xs mt-1">Add a salary or regular source</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recurringRules.map(rule => (
                <div
                  key={rule.id}
                  onClick={() => navigate(`/income/recurring/${rule.id}`)}
                  className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{rule.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{rule.frequency} · next: {getNextDue(rule)}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); openModal('recurring', { editRule: rule }) }}
                        className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); archiveRecurring(rule) }}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xl font-bold text-gray-900">{fmt(rule.amount)}</p>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Templates */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Templates</h2>
            <button
              onClick={() => openModal('template')}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <Plus size={13} /> Add
            </button>
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <FileText size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium">No templates</p>
              <p className="text-xs mt-1">Save amounts you log regularly</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => setLogTemplate({ template: t, amount: String(t.amount), date: todayStr() })}
                  className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{t.name}</p>
                      {t.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{t.note}</p>}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); openModal('template', { editTemplate: t }) }}
                        className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteTemplate(t) }}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-2">{fmt(t.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ Add Income modal ════════════════════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">
                {modal.editEntry ? 'Edit income entry' : 'Add Income'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>

            {!modal.editEntry && (
              <div className="flex gap-1 bg-gray-100 p-1 mx-6 mt-4 rounded-xl">
                {[['quick', 'Quick Entry'], ['recurring', 'Recurring'], ['template', 'Template']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => openModal(id, {})}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      modal.tab === id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'
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
                  {quickError && <p className="text-red-500 text-sm mb-3">{quickError}</p>}
                  <div className="grid grid-cols-2 gap-3">
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
                  <div className="flex gap-3 mt-5">
                    <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={submitQuick} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                      {modal.editEntry ? 'Update' : 'Add income'}
                    </button>
                  </div>
                </div>
              )}

              {/* Recurring */}
              {modal.tab === 'recurring' && (
                <div>
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
                        type="number" value={recurringForm.amount}
                        onChange={e => setRecurringForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {recurringForm.isEdit && recurringForm.amount && Number(recurringForm.amount) !== Number(recurringForm.originalAmount) && (
                        <p className="text-xs text-amber-600 mt-1">Changing the amount will archive the current version.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                      <select
                        value={recurringForm.frequency}
                        onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {(recurringForm.frequency === 'weekly' || recurringForm.frequency === 'monthly') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{dayLabel(recurringForm.frequency)}</label>
                        <input
                          type="number" value={recurringForm.day_of_month}
                          onChange={e => setRecurringForm(f => ({ ...f, day_of_month: e.target.value }))}
                          min={1} max={recurringForm.frequency === 'weekly' ? 7 : 31}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    )}
                    {!recurringForm.isEdit && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                        <input
                          type="date" value={recurringForm.start_date}
                          onChange={e => setRecurringForm(f => ({ ...f, start_date: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={submitRecurring} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                      {recurringForm.isEdit ? 'Save changes' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* Template */}
              {modal.tab === 'template' && (
                <div>
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
                        type="number" value={templateForm.amount}
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
                    <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={submitTemplate} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Income entry</h2>
              <button onClick={() => setDetailEntry(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Source</span>
                <span className="font-medium text-gray-800">{detailEntry.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-green-600">+{fmt(detailEntry.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-700">{format(parseISO(detailEntry.date), 'd MMM yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_BADGE[detailEntry.source_type] ?? 'bg-gray-100 text-gray-500'}`}>
                  {detailEntry.source_type ?? 'manual'}
                </span>
              </div>
              {detailEntry.note && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Note</span>
                  <span className="text-gray-700 text-right max-w-[60%]">{detailEntry.note}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDetailEntry(null)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button
                onClick={() => {
                  const e = detailEntry
                  setDetailEntry(null)
                  openModal('quick', { editEntry: e })
                }}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Log template modal ══════════════════════════════════════════════════ */}
      {logTemplate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Log income</h2>
              <button onClick={() => setLogTemplate(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Template: <span className="font-medium text-gray-700">{logTemplate.template.name}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
                <input
                  type="number" value={logTemplate.amount}
                  onChange={e => setLogTemplate(m => ({ ...m, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date" value={logTemplate.date}
                  onChange={e => setLogTemplate(m => ({ ...m, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setLogTemplate(null)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={submitLogTemplate} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Continue</button>
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
