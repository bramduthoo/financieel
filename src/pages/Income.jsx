import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'

export default function Income() {
  const [entries,   setEntries]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [delTarget, setDelTarget] = useState(null)

  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('Salary')
  const [date,   setDate]   = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  useEffect(() => { fetchEntries() }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data } = await supabase
      .from('income_entries')
      .select('*')
      .order('date', { ascending: false })
    setEntries(data ?? [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!amount || isNaN(Number(amount))) { setError('Enter a valid amount.'); return }
    if (!date) { setError('Pick a date.'); return }
    setSaving(true)
    setError(null)
    await supabase.from('income_entries').insert({
      amount: Number(amount),
      source: source.trim() || 'Salary',
      date,
      note: note.trim() || null,
    })
    setAmount(''); setSource('Salary'); setNote('')
    setDate(format(new Date(), 'yyyy-MM-dd'))
    setShowForm(false)
    setSaving(false)
    fetchEntries()
  }

  async function handleDelete(entry) {
    await supabase.from('income_entries').delete().eq('id', entry.id)
    setDelTarget(null)
    fetchEntries()
  }

  // Group entries by month label
  const grouped = entries.reduce((acc, e) => {
    const label = format(parseISO(e.date), 'MMMM yyyy')
    if (!acc[label]) acc[label] = { entries: [], total: 0 }
    acc[label].entries.push(e)
    acc[label].total += Number(e.amount)
    return acc
  }, {})

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Income</h1>
          <p className="text-gray-500 text-sm mt-1">Track every income entry by month</p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Add income
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New income entry</h2>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <input
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="Salary"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. November salary"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => { setShowForm(false); setError(null) }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save entry'}
            </button>
          </div>
        </div>
      )}

      {/* Entries grouped by month */}
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium mb-1">No income logged yet</p>
          <p className="text-sm">Add your first entry above</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([month, { entries: list, total }]) => (
            <div key={month}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{month}</h2>
                <span className="text-sm font-semibold text-gray-700">€{total.toFixed(2)}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {list.map(e => (
                  <div key={e.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{e.source}</p>
                      <p className="text-xs text-gray-400">
                        {format(parseISO(e.date), 'd MMM yyyy')}
                        {e.note && ` · ${e.note}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-green-600">
                        +€{Number(e.amount).toFixed(2)}
                      </span>
                      <button
                        onClick={() => setDelTarget(e)}
                        className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {delTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Delete entry?</h2>
            <p className="text-gray-500 text-sm mb-6">
              This will permanently remove the{' '}
              <span className="font-medium text-gray-700">
                €{Number(delTarget.amount).toFixed(2)} {delTarget.source}
              </span>{' '}
              entry from {format(parseISO(delTarget.date), 'd MMM yyyy')}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDelTarget(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(delTarget)}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}