import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function DistributionPopup({ totalAmount, onConfirm, onClose, strictMode, existingRules = [] }) {
  const [wallets, setWallets] = useState([])
  const [amounts, setAmounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchWallets() }, [])

  async function fetchWallets() {
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('is_active', true)
      .eq('is_system', false)
      .order('sort_order')
    const ws = data ?? []
    setWallets(ws)
    const init = {}
    for (const rule of existingRules) {
      if (Number(rule.amount) > 0) init[rule.wallet_id] = String(rule.amount)
    }
    setAmounts(init)
    setLoading(false)
  }

  const assignedTotal = wallets.reduce((sum, w) => {
    const v = Number(amounts[w.id] || 0)
    return sum + (isNaN(v) ? 0 : v)
  }, 0)

  const remainder = Number((totalAmount - assignedTotal).toFixed(2))

  function handleWalletClick(wallet) {
    if (Number(amounts[wallet.id] || 0) === 0 && remainder > 0.005) {
      setAmounts(prev => ({ ...prev, [wallet.id]: remainder.toFixed(2) }))
    }
  }

  function handleConfirm() {
    const distributions = wallets
      .filter(w => Number(amounts[w.id] || 0) > 0)
      .map(w => ({ wallet_id: w.id, amount: Number(Number(amounts[w.id]).toFixed(2)) }))
    onConfirm(distributions)
  }

  const diff        = Math.abs(assignedTotal - totalAmount)
  const canConfirm  = strictMode ? diff < 0.005 : true
  const totalColour =
    diff < 0.005                ? 'text-[#3B6D11]' :
    assignedTotal > totalAmount ? 'text-[#A32D2D]'  : 'text-[#854F0B]'

  const grouped = {
    fixed:      wallets.filter(w => w.type === 'fixed'),
    variable:   wallets.filter(w => w.type === 'variable'),
    investment: wallets.filter(w => w.type === 'investment'),
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            Distribute €{totalAmount.toFixed(2)}
          </h2>
          {onClose && (
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Wallet list */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">Loading wallets…</p>
          ) : wallets.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-6">No wallets available.</p>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([type, list]) =>
                list.length === 0 ? null : (
                  <div key={type}>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 capitalize">
                      {type}
                    </p>
                    <div>
                      {list.map(wallet => (
                        <div key={wallet.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-stone-100 last:border-0">
                          <button
                            type="button"
                            onClick={() => handleWalletClick(wallet)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-75 transition-opacity"
                          >
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: wallet.colour }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{wallet.name}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">Balance: €{Number(wallet.balance).toFixed(2)}</p>
                            </div>
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amounts[wallet.id] ?? ''}
                            onChange={e => setAmounts(prev => ({ ...prev, [wallet.id]: e.target.value }))}
                            placeholder="0.00"
                            className="w-24 px-2 py-1.5 text-sm text-right border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Assigned</span>
            <span className={`font-semibold ${totalColour}`}>
              €{assignedTotal.toFixed(2)} of €{totalAmount.toFixed(2)}
            </span>
          </div>
          {!strictMode && remainder > 0.005 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">€{remainder.toFixed(2)} will go to Unallocated</p>
          )}
          <div className="flex gap-3">
            {onClose && (
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                canConfirm
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              Distribute
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
