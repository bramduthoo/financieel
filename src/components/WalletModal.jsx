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

const inputClass = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

export default function WalletModal({ wallet, onClose, onSave }) {
  const [name,       setName]       = useState(wallet?.name        ?? '')
  const [type,       setType]       = useState(wallet?.type        ?? 'fixed')
  const [budgetType, setBudgetType] = useState(wallet?.budget_type ?? 'fixed-recurring')
  const [budget,     setBudget]     = useState(wallet?.budget      ?? '')
  const [colour,     setColour]     = useState(wallet?.colour      ?? COLOURS[0])
  const [sortOrder,  setSortOrder]  = useState(wallet?.sort_order  ?? 0)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)

  const [capReductionEnabled, setCapReductionEnabled] = useState(wallet?.cap_reduction_enabled ?? false)
  const [capReductionRate,    setCapReductionRate]    = useState(
    wallet?.cap_reduction_rate ? String(Math.round(Number(wallet.cap_reduction_rate) * 100)) : '50'
  )

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
    const payload = { name: name.trim(), type, budget_type: budgetType, budget: Number(budget) || 0, colour, sort_order: Number(sortOrder) || 0 }
    if (type === 'variable' && budgetType === 'capped') {
      payload.cap_reduction_enabled = capReductionEnabled
      payload.cap_reduction_rate    = capReductionEnabled ? Number(capReductionRate) / 100 : 1.0
    }
    await onSave(payload)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">

        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>

        <h2 className="text-lg font-medium text-gray-900 mb-6">
          {wallet ? 'Edit wallet' : 'New wallet'}
        </h2>

        {error && <p className="text-[#A32D2D] text-sm mb-4">{error}</p>}

        {/* Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Rent, Holidays, Groceries"
            className={inputClass}
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
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-stone-300 hover:border-gray-400'
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
                    ? 'bg-stone-100 border-gray-400 text-gray-900'
                    : 'bg-white border-stone-300 text-gray-600 hover:border-gray-400'
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
              className={inputClass}
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
            className={inputClass}
          />
        </div>

        {/* Cap reduction settings — capped variable wallets only */}
        {type === 'variable' && budgetType === 'capped' && (
          <div className="mb-6 border border-stone-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Cap reduction settings</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Enable reduction when cap is reached</span>
              <button
                type="button"
                onClick={() => setCapReductionEnabled(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
                  capReductionEnabled ? 'bg-gray-900' : 'bg-stone-200'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  capReductionEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
            {capReductionEnabled && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Receive % of normal distribution after cap
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={capReductionRate}
                      onChange={e => setCapReductionRate(e.target.value)}
                      className="w-20 px-3 py-2 border border-stone-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  When your balance reaches the cap, automated income will be reduced to {capReductionRate || '?'}% of its normal amount. The rest goes to Unallocated.
                </p>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : wallet ? 'Save changes' : 'Create wallet'}
          </button>
        </div>

      </div>
    </div>
  )
}
