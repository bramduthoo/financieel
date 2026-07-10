import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { format, addMonths } from 'date-fns'
import { formatFrequency } from '../lib/recurringUtils'
import { formatMoney } from '../lib/format'

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom']
const WEEKDAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const Q1_MONTHS   = ['January','February','March']

const emptyForm = {
  name: '', description: '', amount: '',
  frequency: 'monthly', start_date: format(new Date(), 'yyyy-MM-dd'),
  day_of_month: '1', quarter_month: '1', yearly_month: '0',
  custom_dates: [], custom_cycle_years: 1, custom_repeat: true,
}

export default function RecurringRules({ walletId, onRulesChanged }) {
  const [rules,     setRules]     = useState([])
  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)

  useEffect(() => { fetchRules() }, [walletId])

  async function fetchRules() {
    const { data } = await supabase
      .from('recurring_rules').select('*')
      .eq('wallet_id', walletId).is('end_date', null).order('created_at')
    setRules(data ?? [])
    onRulesChanged?.()
  }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function openCreate() {
    setEditingId(null); setForm(emptyForm)
    setShowForm(true);  setError(null)
  }

  function openEdit(rule) {
    setEditingId(rule.id)
    setForm({
      name:               rule.name         ?? '',
      description:        rule.description  ?? '',
      amount:             String(rule.amount),
      frequency:          rule.frequency,
      start_date:         rule.start_date,
      day_of_month:       String(rule.day_of_month  ?? 1),
      quarter_month:      String(rule.quarter_month ?? 1),
      yearly_month:       String(rule.yearly_month  ?? 0),
      custom_dates:       rule.custom_dates         ?? [],
      custom_cycle_years: rule.custom_cycle_years   ?? 1,
      custom_repeat:      true,
    })
    setShowForm(true); setError(null)
  }

  function toggleCustomDate(mmdd) {
    setForm(f => ({
      ...f,
      custom_dates: f.custom_dates.includes(mmdd)
        ? f.custom_dates.filter(d => d !== mmdd)
        : [...f.custom_dates, mmdd].sort()
    }))
  }

  async function handleSave() {
    if (!form.name.trim())   { setError('Enter a name.'); return }
    if (!form.amount || isNaN(Number(form.amount))) { setError('Enter a valid amount.'); return }
    if (form.frequency === 'custom' && form.custom_dates.length === 0) {
      setError('Select at least one custom date.'); return
    }
    setSaving(true); setError(null)

    const userId = await getCurrentUserId()

    const payload = {
      wallet_id:          walletId,
      name:               form.name.trim(),
      description:        form.description.trim() || null,
      amount:             Number(form.amount),
      frequency:          form.frequency,
      start_date:         form.start_date,
      end_date:           null,
      parent_rule_id:     null,
      day_of_month:       null,
      quarter_month:      null,
      yearly_month:       null,
      custom_dates:       null,
      custom_cycle_years: null,
      user_id:            userId,
    }

    // Set frequency-specific fields
    switch (form.frequency) {
      case 'daily':
      // No day field needed — advances by 1 day from start_date
        break
      case 'weekly':
        payload.day_of_month = Number(form.day_of_month) || 1
        break
      case 'monthly':
        payload.day_of_month = Math.min(Math.max(Number(form.day_of_month) || 1, 1), 31)
        break
      case 'quarterly':
        payload.day_of_month  = Math.min(Math.max(Number(form.day_of_month) || 1, 1), 31)
        payload.quarter_month = Math.min(Math.max(Number(form.quarter_month) || 1, 1), 3)
        break
      case 'yearly':
        payload.day_of_month = Math.min(Math.max(Number(form.day_of_month) || 1, 1), 31)
        payload.yearly_month = Number(form.yearly_month) || 0
        break
      case 'custom':
        payload.custom_dates       = form.custom_dates
        payload.custom_cycle_years = Number(form.custom_cycle_years) || 1
        break
}

    if (editingId) {
      const original     = rules.find(r => r.id === editingId)
      const amountChanged = original && Number(original.amount) !== payload.amount
      if (amountChanged) {
        await supabase.from('recurring_rules')
          .update({ end_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', editingId)
        await supabase.from('recurring_rules')
          .insert({ ...payload, parent_rule_id: editingId })
      } else {
        await supabase.from('recurring_rules').update(payload).eq('id', editingId)
      }
    } else {
      await supabase.from('recurring_rules').insert(payload)
    }

    setShowForm(false); setEditingId(null); setForm(emptyForm)
    setSaving(false);   fetchRules()
  }

  async function handleDelete(id) {
    await supabase.from('recurring_rules')
      .update({ end_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', id)
    fetchRules()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Recurring payments</h2>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 text-xs text-gray-900 hover:text-gray-700 font-medium">
          <Plus size={14} /> Add
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              {editingId ? 'Edit payment' : 'New payment'}
            </span>
            <button onClick={() => setShowForm(false)}>
              <X size={14} className="text-gray-400" />
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

          <div className="space-y-3">
            {/* Name + Description */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Name</label>
              <input value={form.name} onChange={e => setField('name', e.target.value)}
                placeholder="e.g. Rent"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description (optional)</label>
              <input value={form.description} onChange={e => setField('description', e.target.value)}
                placeholder="e.g. Apartment on Ghent city centre"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
            </div>

            {/* Amount + Start date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Amount (€)</label>
                <input type="number" value={form.amount} onChange={e => setField('amount', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Start date</label>
                <input type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
              </div>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Frequency</label>
              <select value={form.frequency} onChange={e => setField('frequency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100">
                {FREQUENCIES.map(f => (
                  <option key={f} value={f}>{formatFrequency(f)}</option>
                ))}
              </select>
            </div>

            {/* Payment day — adapts to frequency */}
            {form.frequency === 'weekly' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Day of week</label>
                <select value={form.day_of_month} onChange={e => setField('day_of_month', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100">
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i + 1}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {form.frequency === 'monthly' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Day of month <span className="text-gray-400 dark:text-gray-500">(1–31)</span>
                </label>
                <input type="number" min="1" max="31"
                  value={form.day_of_month} onChange={e => setField('day_of_month', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
              </div>
            )}

            {form.frequency === 'quarterly' && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Payment day within Q1 <span className="text-gray-400 dark:text-gray-500">(system extrapolates Q2–Q4)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Month of quarter</label>
                    <select value={form.quarter_month} onChange={e => setField('quarter_month', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100">
                      {Q1_MONTHS.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Day of month (1–31)</label>
                    <input type="number" min="1" max="31"
                      value={form.day_of_month} onChange={e => setField('day_of_month', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  e.g. {Q1_MONTHS[Number(form.quarter_month) - 1]} {form.day_of_month} →
                  also fires on {getQuarterPreview(Number(form.quarter_month), Number(form.day_of_month))}
                </p>
              </div>
            )}

            {form.frequency === 'yearly' && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Yearly payment date</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Month</label>
                    <select value={form.yearly_month} onChange={e => setField('yearly_month', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100">
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Day (1–31)</label>
                    <input type="number" min="1" max="31"
                      value={form.day_of_month} onChange={e => setField('day_of_month', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                </div>
              </div>
            )}

            {form.frequency === 'custom' && (
              <CustomDatePicker
                form={form}
                setField={setField}
                toggleCustomDate={toggleCustomDate}
              />
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => { setShowForm(false); setError(null) }}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add payment'}
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-xs text-gray-400">No recurring payments yet.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id}
              className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.name}</p>
                {r.description && <p className="text-xs text-gray-400 dark:text-gray-500">{r.description}</p>}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatMoney(Number(r.amount))} · {formatFrequency(r.frequency)}
                  {r.frequency === 'monthly'   && r.day_of_month  ? ` · day ${r.day_of_month}` : ''}
                  {r.frequency === 'weekly'    && r.day_of_month  ? ` · ${WEEKDAYS[r.day_of_month - 1]}` : ''}
                  {r.frequency === 'quarterly' && r.day_of_month  ? ` · Q-month ${r.quarter_month}, day ${r.day_of_month}` : ''}
                  {r.frequency === 'yearly'    && r.yearly_month !== null ? ` · ${MONTHS[r.yearly_month]} ${r.day_of_month}` : ''}
                </p>
                <p className="text-xs text-gray-400">From {format(new Date(r.start_date), 'd MMM yyyy')}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)}
                  className="p-1.5 text-gray-300 hover:text-gray-700 hover:bg-stone-100 rounded-lg transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(r.id)}
                  className="p-1.5 text-gray-300 hover:text-[#A32D2D] hover:bg-[#FCEBEB] rounded-lg transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getQuarterPreview(quarterMonth, day) {
  const months = ['Jan','Apr','Jul','Oct']
  return months.slice(1).map(m => {
    const offset = months.indexOf(m) * 3
    const mIndex = (quarterMonth - 1) + offset
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mIndex % 12]} ${day}`
  }).join(', ')
}

function CustomDatePicker({ form, setField, toggleCustomDate }) {
  const [page, setPage] = useState(0)
  const cycleYears = form.custom_repeat ? (Number(form.custom_cycle_years) || 1) : 1
  const startYear  = new Date().getFullYear()

  const totalMonths = cycleYears * 12
  const months = []
  for (let i = 0; i < totalMonths; i++) {
    const year  = startYear + Math.floor(i / 12)
    const month = i % 12
    months.push({ year, month })
  }

  const MONTHS_FULL = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December']
  const pageSize = 3
  const pages    = Math.ceil(months.length / pageSize)
  const visible  = months.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">Select payment dates</label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Repeats yearly</span>
          <button
            type="button"
            onClick={() => setField('custom_repeat', !form.custom_repeat)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              form.custom_repeat ? 'bg-gray-900' : 'bg-stone-300'
            }`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
              form.custom_repeat ? 'translate-x-5' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {!form.custom_repeat && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Repeat every N years</label>
          <input type="number" min="1" max="10"
            value={form.custom_cycle_years}
            onChange={e => setField('custom_cycle_years', Number(e.target.value))}
            className="w-24 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
          className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30">← Prev</button>
        <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, months.length)} of {months.length} months</span>
        <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
          className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30">Next →</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {visible.map(({ year, month }) => {
          const daysInMonth = new Date(year, month + 1, 0).getDate()
          const firstDay    = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0

          return (
            <div key={`${year}-${month}`} className="border border-stone-200 rounded-lg p-2">
              <p className="text-xs font-semibold text-gray-600 text-center mb-2">
                {MONTHS_FULL[month]} {year}
              </p>
              <div className="grid grid-cols-7 text-center gap-px">
                {['M','T','W','T','F','S','S'].map((d, i) => (
                  <div key={i} className="text-xs text-gray-300 pb-1">{d}</div>
                ))}
                {Array(firstDay).fill(null).map((_, i) => <div key={`b${i}`} />)}
                {Array(daysInMonth).fill(null).map((_, i) => {
                  const day  = i + 1
                  const mmdd = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const sel  = form.custom_dates.includes(mmdd)
                  return (
                    <button key={day} type="button" onClick={() => toggleCustomDate(mmdd)}
                      className={`text-xs rounded py-0.5 transition-colors ${
                        sel ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-stone-100'
                      }`}>
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {form.custom_dates.length > 0 && (
        <p className="text-xs text-gray-500">
          {form.custom_dates.length} date{form.custom_dates.length !== 1 ? 's' : ''} selected:
          {' '}{form.custom_dates.join(', ')}
        </p>
      )}
    </div>
  )
}