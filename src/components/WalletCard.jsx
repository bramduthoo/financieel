import { Lock, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function WalletCard({ wallet, onEdit, onDelete }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/wallets/${wallet.id}`)}
<<<<<<< HEAD
      className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow cursor-pointer"
=======
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer"
>>>>>>> WOUTER
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: wallet.colour }}
          />
          <div>
<<<<<<< HEAD
            <h3 className="text-sm font-medium text-gray-900">{wallet.name}</h3>
            <span className="text-xs text-gray-400 capitalize">{wallet.type}</span>
=======
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{wallet.name}</h3>
            <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{wallet.type}</span>
>>>>>>> WOUTER
          </div>
        </div>

        {wallet.is_system ? (
<<<<<<< HEAD
          <Lock size={13} className="text-gray-400" title="System wallet" />
=======
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
            <Lock size={10} />
            System
          </div>
>>>>>>> WOUTER
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
<<<<<<< HEAD
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Monthly budget</p>
          <p className="text-base font-medium text-gray-900">€{Number(wallet.budget).toFixed(2)}</p>
=======
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <span className="text-gray-400 dark:text-gray-500 text-xs">Monthly budget</span>
          <p className="font-semibold text-gray-800 dark:text-gray-100">€{Number(wallet.budget).toFixed(2)}</p>
>>>>>>> WOUTER
        </div>
      )}

      {/* Balance — shown for unallocated/system wallets */}
      {wallet.type === 'unallocated' && (
<<<<<<< HEAD
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Balance</p>
          <p className={`text-base font-medium ${Number(wallet.balance) >= 0 ? 'text-[#3B6D11]' : 'text-[#A32D2D]'}`}>
=======
        <div className="text-sm">
          <span className="text-gray-400 dark:text-gray-500 text-xs">Balance</span>
          <p className={`font-semibold ${Number(wallet.balance) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
>>>>>>> WOUTER
            €{Number(wallet.balance).toFixed(2)}
          </p>
        </div>
      )}

      {/* Budget type pill */}
      <div>
<<<<<<< HEAD
        <span className="inline-block text-[11px] text-gray-600 bg-stone-100 px-2 py-0.5 rounded-full capitalize">
=======
        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 capitalize">
>>>>>>> WOUTER
          {wallet.budget_type.replace('-', ' ')}
        </span>
      </div>
    </div>
  )
}
