import { Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function WalletCard({ wallet, onEdit, onDelete }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/wallets/${wallet.id}`)}
      className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: wallet.colour }}
          />
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">{wallet.name}</h3>
            <span className="text-xs text-gray-400 capitalize">{wallet.type}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={e => { e.stopPropagation(); onEdit(wallet) }}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(wallet) }}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Budget */}
      {wallet.type !== 'investment' && (
        <div className="text-sm text-gray-600">
          <span className="text-gray-400 text-xs">Monthly budget</span>
          <p className="font-semibold text-gray-800">€{Number(wallet.budget).toFixed(2)}</p>
        </div>
      )}

      {/* Budget type badge */}
      <div>
        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
          {wallet.budget_type.replace('-', ' ')}
        </span>
      </div>
    </div>
  )
}