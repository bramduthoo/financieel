import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const COLOURS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6'
]

const ICONS = ['wallet', 'home', 'zap', 'droplets', 'car', 'plane', 'shirt', 'heart', 'trending-up']

const BUDGET_TYPES = {
  fixed:      [{ value: 'fixed-recurring', label: 'Fixed recurring',  desc: 'Same amount out every month (e.g. rent)'         }],
  variable:   [{ value: 'accumulating',    label: 'Accumulating',     desc: 'Unused budget carries over (e.g. holidays)'      },
               { value: 'capped',          label: 'Capped',           desc: 'Has a maximum balance it won\'t exceed (e.g. clothing)' }],
  investment: [{ value: 'none',            label: 'No budget',        desc: 'Tracks value over time, no monthly budget'       }],
}

export default function WalletModal({ wallet, onClose, onSave }) {
  const [name,       setName]       = useState(wallet?.name        ?? '')
  const [type,       setType]       = useState(wallet?.type        ?? 'fixed')
  const [budgetType, setBudgetType] = useState(wallet?.budget_type ?? 'fixed-recurring')
  const [budget,     setBudget]     = useState(wallet?.budget      ?? '')
  const [colour,     setColour]     = useState(wallet?.colour      ?? COLOURS[0])
  const [sortOrder,  setSortOrder]  = useState(wallet?.sort_order  ?? 0)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)

  // When type changes, auto-select the first valid budget_type for that type
  useEffect(() => {
    const options = BUDGET_TYPES[type]
    if (!options.find(o => o.value === budgetType)) {
      setBudgetType(options[0].value)
    }
  }, [type])

  async function handleSave() {
    if (!name.trim()) { setError('Please enter a wallet name.'); return }
    setSaving(true)
    setError(null)
    await onSave({ name: name.trim(), type, budget_type: budgetType, budget: Number(budget) || 0, colour, sort_order: Number(sortOrder) || 0 })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">

        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold text-gray-800 mb-6">
          {wallet ? 'Edit wallet' : 'New wallet'}
        </h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {/* Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Rent, Holidays, Groceries"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {['fixed', 'variable', 'investment'].map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                  type === t
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Budget type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Budget behaviour</label>
          <div className="space-y-2">
            {BUDGET_TYPES[type].map(opt => (
              <button
                key={opt.value}
                onClick={() => setBudgetType(opt.value)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  budgetType === opt.value
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-300'
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Budget amount — hide for investment */}
        {type !== 'investment' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monthly budget (€)
            </label>
            <input
              type="number"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        {/* Colour */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Colour</label>
          <div className="flex gap-2 flex-wrap">
            {COLOURS.map(c => (
              <button
                key={c}
                onClick={() => setColour(c)}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-full transition-transform ${
                  colour === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Sort order */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display order <span className="text-gray-400 font-normal">(lower = appears first)</span>
          </label>
          <input
            type="number"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : wallet ? 'Save changes' : 'Create wallet'}
          </button>
        </div>

      </div>
    </div>
  )
}