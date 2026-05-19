import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { formatFrequency } from '../lib/recurringUtils'

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

const emptyForm = {
  description: '', amount: '', frequency: 'monthly',
  day_of_month: '1', start_date: format(new Date(), 'yyyy-MM-dd'),
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
      .from('recurring_rules')
      .select('*')
      .eq('wallet_id', walletId)
      .is('end_date', null)
      .order('created_at')
    setRules(data ?? [])
    onRulesChanged?.()
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setError(null)
  }

  function openEdit(rule) {
    setEditingId(rule.id)
    setForm({
      description:  rule.description  ?? '',
      amount:       String(rule.amount),
      frequency:    rule.frequency,
      day_of_month: String(rule.day_of_month ?? 1),
      start_date:   rule.start_date,
    })
    setShowForm(true)
    setError(null)
  }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form.description.trim())        { setError('Enter a description.'); return }
    if (!form.amount || isNaN(Number(form.amount))) { setError('Enter a valid amount.'); return }
    setSaving(true); setError(null)

    const payload = {
      wallet_id:    walletId,
      description:  form.description.trim(),
      amount:       Number(form.amount),
      frequency:    form.frequency,
      day_of_month: ['daily'].includes(form.frequency) ? null : Number(form.day_of_month) || 1,
      start_date:   form.start_date,
      end_date:     null,
      parent_rule_id: null,
    }

    if (editingId) {
      const original = rules.find(r => r.id === editingId)
      const amountChanged = original && Number(original.amount) !== payload.amount

      if (amountChanged) {
        // Archive old rule, create new one linked to it
        await supabase.from('recurring_rules')
          .update({ end_date: format(new Date(), 'yyyy-MM-dd') })
          .eq('id', editingId)
        await supabase.from('recurring_rules')
          .insert({ ...payload, parent_rule_id: editingId })
      } else {
        await supabase.from('recurring_rules')
          .update(payload)
          .eq('id', editingId)
      }
    } else {
      await supabase.from('recurring_rules').insert(payload)
    }

    setShowForm(false); setEditingId(null); setForm(emptyForm)
    setSaving(false); fetchRules()
  }

  async function handleDelete(id) {
    await supabase.from('recurring_rules')
      .update({ end_date: format(new Date(), 'yyyy-MM-dd') })
      .eq('id', id)
    fetchRules()
  }

  const showDayField = form.frequency !== 'daily'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Recurring payments</h2>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
          <Plus size={14} /> Add
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-gray-600">
              {editingId ? 'Edit payment' : 'New payment'}
            </span>
            <button onClick={() => setShowForm(false)}>
              <X size={14} className="text-gray-400" />
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={form.description} onChange={e => setField('description', e.target.value)}
                placeholder="e.g. Monthly rent"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
                <input type="number" value={form.amount} onChange={e => setField('amount', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                <select value={form.frequency} onChange={e => setField('frequency', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {FREQUENCIES.map(f => (
                    <option key={f} value={f}>{formatFrequency(f)}</option>
                  ))}
                </select>
              </div>
              {showDayField && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {form.frequency === 'weekly' ? 'Day of week (1=Mon)' : 'Day of month'}
                  </label>
                  <input type="number" min="1" max={form.frequency === 'weekly' ? 7 : 31}
                    value={form.day_of_month} onChange={e => setField('day_of_month', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                <input type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => { setShowForm(false); setError(null) }}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
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
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{r.description}</p>
                <p className="text-xs text-gray-400">
                  €{Number(r.amount).toFixed(2)} · {formatFrequency(r.frequency)}
                  {r.day_of_month ? ` · day ${r.day_of_month}` : ''}
                </p>
                <p className="text-xs text-gray-400">
                  From {format(new Date(r.start_date), 'd MMM yyyy')}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)}
                  className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(r.id)}
                  className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
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