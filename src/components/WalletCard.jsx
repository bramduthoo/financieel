import { Lock, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function WalletCard({ wallet, onEdit, onDelete }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/wallets/${wallet.id}`)}
      className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: wallet.colour }}
          />
          <div>
            <h3 className="text-sm font-medium text-gray-900">{wallet.name}</h3>
            <span className="text-xs text-gray-400 capitalize">{wallet.type}</span>
          </div>
        </div>

        {wallet.is_system ? (
          <Lock size={13} className="text-gray-400" title="System wallet" />
        ) : (
          <div className="flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); onEdit(wallet) }}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(wallet) }}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Budget — hidden for investment/unallocated wallets */}
      {wallet.type !== 'investment' && wallet.type !== 'unallocated' && (
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Monthly budget</p>
          <p className="text-base font-medium text-gray-900">€{Number(wallet.budget).toFixed(2)}</p>
        </div>
      )}

      {/* Balance — shown for unallocated/system wallets */}
      {wallet.type === 'unallocated' && (
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Balance</p>
          <p className={`text-base font-medium ${Number(wallet.balance) >= 0 ? 'text-[#3B6D11]' : 'text-[#A32D2D]'}`}>
            €{Number(wallet.balance).toFixed(2)}
          </p>
        </div>
      )}

      {/* Budget type pill */}
      <div>
        <span className="inline-block text-[11px] text-gray-600 bg-stone-100 px-2 py-0.5 rounded-full capitalize">
          {wallet.budget_type.replace('-', ' ')}
        </span>
      </div>
    </div>
  )
}
