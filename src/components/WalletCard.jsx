import { Lock, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'

export default function WalletCard({ wallet, onEdit, onDelete }) {
  const navigate = useNavigate()
  const showBudget  = wallet.type !== 'investment' && wallet.type !== 'unallocated'
  const showBalance = wallet.type === 'unallocated'

  return (
    <div
      onClick={() => navigate(`/wallets/${wallet.id}`)}
      className="bg-card rounded-[14px] border border-card-border p-4 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Header — icon chip + name, actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-[9px] bg-accent/10 flex items-center justify-center flex-shrink-0">
            <WalletIcon wallet={wallet} size={18} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-ink text-sm truncate">{wallet.name}</h3>
            <span className="text-[11px] uppercase tracking-wider text-ink-muted">{wallet.type}</span>
          </div>
        </div>

        {wallet.is_system ? (
          <div className="flex items-center gap-1 text-[11px] text-ink-muted bg-track px-2 py-1 rounded-full flex-shrink-0">
            <Lock size={10} />
            System
          </div>
        ) : (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={e => { e.stopPropagation(); onEdit(wallet) }}
              className="p-1.5 text-ink-faint hover:text-ink hover:bg-track rounded-lg transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(wallet) }}
              className="p-1.5 text-ink-faint hover:text-negative hover:bg-negative-tint rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Hero number — budget or balance */}
      {(showBudget || showBalance) && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-muted mb-0.5">
            {showBalance ? 'Balance' : 'Monthly budget'}
          </p>
          <p className={`text-lg font-medium tracking-tight ${
            showBalance
              ? (Number(wallet.balance) >= 0 ? 'text-positive' : 'text-negative')
              : 'text-ink'
          }`}>
            {formatMoney(Number(showBalance ? wallet.balance : wallet.budget))}
          </p>
        </div>
      )}

      {/* Budget-type badge */}
      <div className="mt-auto">
        <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-track text-ink-muted capitalize">
          {wallet.budget_type.replace('-', ' ')}
        </span>
      </div>
    </div>
  )
}
