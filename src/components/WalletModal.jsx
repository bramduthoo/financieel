import { useState, useEffect } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { WALLET_ICONS, ICON_CHOICES, defaultIconForType } from '../lib/walletIcons'

// Wallets keep a stored `colour` (defaulted) for legacy data, but the UI now
// identifies wallets by their chosen icon, not colour.
const DEFAULT_COLOUR = '#639922'

const BUDGET_TYPES = {
  fixed:      [{ value: 'fixed-recurring', label: 'Fixed recurring',  desc: 'Same amount out every month (e.g. rent)'         }],
  variable:   [{ value: 'accumulating',    label: 'Accumulating',     desc: 'Unused budget carries over (e.g. holidays)'      },
               { value: 'capped',          label: 'Capped',           desc: 'Has a maximum balance it won\'t exceed (e.g. clothing)' }],
  investment: [{ value: 'none',            label: 'No budget',        desc: 'Tracks value over time, no monthly budget'       }],
}

const inputClass =
  'w-full px-3 py-2 bg-field border border-card-border rounded-[8px] text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30'

export default function WalletModal({ wallet, initialType, onClose, onSave }) {
  const [name,       setName]       = useState(wallet?.name        ?? '')
  const [type,       setType]       = useState(wallet?.type        ?? initialType ?? 'fixed')
  const [budgetType, setBudgetType] = useState(wallet?.budget_type ?? 'fixed-recurring')
  const [budget,     setBudget]     = useState(wallet?.budget      ?? '')
  const [sortOrder,  setSortOrder]  = useState(wallet?.sort_order  ?? 0)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)

  const colour = wallet?.colour ?? DEFAULT_COLOUR
  const [icon, setIcon] = useState(wallet?.icon || defaultIconForType(wallet?.type ?? 'fixed'))

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
    const payload = { name: name.trim(), type, budget_type: budgetType, budget: Number(budget) || 0, colour, icon, sort_order: Number(sortOrder) || 0 }
    if (type === 'variable' && budgetType === 'capped') {
      payload.cap_reduction_enabled = capReductionEnabled
      payload.cap_reduction_rate    = capReductionEnabled ? Number(capReductionRate) / 100 : 1.0
    }
    await onSave(payload)
    setSaving(false)
  }

  const order = Number(sortOrder) || 0

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-card-border rounded-[14px] shadow-xl w-full max-w-sm p-5 relative max-h-[90vh] overflow-y-auto">

        <button onClick={onClose} className="absolute top-4 right-4 text-ink-faint hover:text-ink transition-colors">
          <X size={18} />
        </button>

        <h2 className="text-base font-medium text-ink mb-4">
          {wallet ? 'Edit wallet' : 'New wallet'}
        </h2>

        {error && <p className="text-negative text-sm mb-4">{error}</p>}

        {/* Name */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-ink-soft mb-1">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Rent, Holidays, Groceries"
            className={inputClass}
          />
        </div>

        {/* Type — segmented */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-ink-soft mb-1">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {['fixed', 'variable', 'investment'].map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-2 rounded-[9px] text-sm font-medium border transition-colors capitalize ${
                  type === t
                    ? 'bg-ink text-cream border-ink'
                    : 'bg-field text-ink-soft border-card-border hover:border-ink-faint'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Budget behaviour — selectable cards */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-ink-soft mb-1">Budget behaviour</label>
          <div className="space-y-2">
            {BUDGET_TYPES[type].map(opt => (
              <button
                key={opt.value}
                onClick={() => setBudgetType(opt.value)}
                className={`w-full text-left px-3 py-2 rounded-[11px] border text-sm transition-colors ${
                  budgetType === opt.value
                    ? 'border-accent ring-1 ring-accent bg-accent/5 text-ink'
                    : 'bg-card border-card-border text-ink-soft hover:border-ink-faint'
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="block text-xs text-ink-muted mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Budget amount — hide for investment */}
        {type !== 'investment' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Monthly budget (€)
            </label>
            <input
              type="number"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} text-right`}
            />
          </div>
        )}

        {/* Icon */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-soft mb-1">Icon</label>
          <div className="flex gap-2 flex-wrap">
            {ICON_CHOICES.map(name => {
              const IconOption = WALLET_ICONS[name]
              const active = icon === name
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  className={`w-9 h-9 rounded-[9px] flex items-center justify-center border transition-colors ${
                    active
                      ? 'border-accent ring-1 ring-accent bg-accent/10 text-accent'
                      : 'border-card-border text-ink-soft hover:border-ink-faint'
                  }`}
                >
                  <IconOption size={16} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Display order — stepper */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Display order <span className="text-ink-faint font-normal">(lower = appears first)</span>
          </label>
          <div className="inline-flex items-center rounded-[8px] border border-card-border bg-field overflow-hidden">
            <button
              type="button"
              onClick={() => setSortOrder(Math.max(0, order - 1))}
              className="px-3 py-2 text-ink-soft hover:text-ink hover:bg-track transition-colors"
              aria-label="Decrease display order"
            >
              <Minus size={14} />
            </button>
            <span className="w-12 text-center text-sm text-ink tabular-nums">{order}</span>
            <button
              type="button"
              onClick={() => setSortOrder(order + 1)}
              className="px-3 py-2 text-ink-soft hover:text-ink hover:bg-track transition-colors"
              aria-label="Increase display order"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Cap reduction settings — capped variable wallets only */}
        {type === 'variable' && budgetType === 'capped' && (
          <div className="mb-6 border border-card-border rounded-[11px] p-4 space-y-3">
            <p className="text-sm font-medium text-ink-soft">Cap reduction settings</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Enable reduction when cap is reached</span>
              <button
                type="button"
                onClick={() => setCapReductionEnabled(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                  capReductionEnabled ? 'bg-accent-solid' : 'bg-ink-faint'
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
                  <label className="block text-xs font-medium text-ink-muted mb-1">
                    Receive % of normal distribution after cap
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={capReductionRate}
                      onChange={e => setCapReductionRate(e.target.value)}
                      className={`${inputClass} w-20 text-right`}
                    />
                    <span className="text-sm text-ink-muted">%</span>
                  </div>
                </div>
                <p className="text-xs text-ink-faint leading-relaxed">
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
            className="flex-1 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-[9px] bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : wallet ? 'Save changes' : 'Create wallet'}
          </button>
        </div>

      </div>
    </div>
  )
}
