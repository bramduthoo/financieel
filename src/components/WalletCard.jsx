import { Pencil, Trash2, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'
import { walletActivityThisMonth, nextPaymentDue } from '../lib/walletMetrics'
import MetricBar from './ui/MetricBar'
import CardFooterMeta from './ui/CardFooterMeta'

// Density-pass wallet card (DESIGN-SPEC §8, rule 1): hero balance (22px) + a metric bar
// with an honest denominator + 11px caption + a real footer metadata line. Investment
// and the Unallocated system card omit the bar (no honest denominator).
export default function WalletCard({
  wallet, onEdit, onDelete,
  transactions = [], recurringRules = [], activePlanCount = 0, now = new Date(),
}) {
  const navigate = useNavigate()

  const isUnalloc = wallet.type === 'unallocated' || wallet.is_system
  const balance   = Number(wallet.balance)
  const budget    = Number(wallet.budget)
  const bt        = wallet.budget_type

  const badge = isUnalloc
    ? 'System'
    : bt === 'capped'       ? `Capped · ${formatMoney(budget, { decimals: 0 })}`
    : bt === 'accumulating' ? 'Accumulating'
    : wallet.type === 'investment' ? 'Investment'
    : 'Fixed'

  const monthLabel = format(now, 'MMM').toLowerCase()

  // Body (bar + caption) and footer metadata resolved per card type from real data.
  let bar = null
  let caption = null
  let footer = null

  if (!isUnalloc) {
    const { netInflow, count } = walletActivityThisMonth(wallet.id, transactions, now)
    const txFooter = `${count} transaction${count === 1 ? '' : 's'} · ${monthLabel}`

    if (bt === 'fixed-recurring' || bt === 'recurring') {
      const due = nextPaymentDue(recurringRules, wallet.id, now)
      bar = budget > 0 ? { value: balance, max: budget } : null
      caption = budget > 0
        ? `${formatMoney(balance, { decimals: 0 })} of ${formatMoney(budget, { decimals: 0 })} funded`
        : 'no monthly budget set'
      footer = due ? `due ${format(due, 'd MMM').toLowerCase()}` : 'no scheduled payment'
    } else if (bt === 'capped') {
      const pct = budget > 0 ? Math.round((balance / budget) * 100) : 0
      bar = budget > 0 ? { value: balance, max: budget } : null
      caption = budget > 0 ? `${pct}% of cap` : 'no cap set'
      footer = txFooter
    } else if (bt === 'accumulating') {
      bar = budget > 0 ? { value: netInflow, max: budget } : null
      caption = netInflow >= 0
        ? `+${formatMoney(netInflow, { decimals: 0 })} this month`
        : `${formatMoney(netInflow, { decimals: 0 })} this month`
      footer = txFooter
    } else {
      // investment / none — no honest bar denominator.
      caption = netInflow === 0
        ? 'no change this month'
        : `${netInflow > 0 ? '+' : ''}${formatMoney(netInflow, { decimals: 0 })} this month`
      footer = txFooter
    }
  }

  return (
    <div
      onClick={() => navigate(`/wallets/${wallet.id}`)}
      className="group relative bg-card rounded-[14px] border border-card-border p-4 flex flex-col gap-2.5 min-h-[148px] hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Header — icon chip + name + type badge */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-[9px] bg-accent/10 flex items-center justify-center flex-shrink-0">
          <WalletIcon wallet={wallet} size={16} className="text-accent" />
        </div>
        <h3 className="font-medium text-ink text-sm truncate flex-1 min-w-0">{wallet.name}</h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
          isUnalloc ? 'bg-accent/10 text-accent' : 'bg-track text-ink-muted'
        }`}>
          {badge}
        </span>
      </div>

      {/* Hero balance */}
      <p className={`text-[22px] font-medium tracking-tight leading-none ${isUnalloc ? 'text-accent' : 'text-ink'}`}>
        {formatMoney(balance)}
      </p>

      {isUnalloc ? (
        <div className="mt-auto flex items-center justify-between">
          <span className="text-[11px] text-ink-muted">
            {activePlanCount} plan{activePlanCount === 1 ? '' : 's'} active
          </span>
          <span className="text-[11px] font-medium text-ink group-hover:text-accent flex items-center gap-1">
            Distribute <ArrowRight size={12} />
          </span>
        </div>
      ) : (
        <>
          {bar && <MetricBar value={bar.value} max={bar.max} />}
          {caption && <p className="text-[11px] text-ink-muted">{caption}</p>}
          <CardFooterMeta>{footer}</CardFooterMeta>
        </>
      )}

      {/* Hover actions — non-system only */}
      {!wallet.is_system && (
        <div className="absolute top-2.5 right-2.5 hidden group-hover:flex focus-within:flex pointer-coarse:flex gap-1 bg-card/90 rounded-lg">
          <button
            onClick={e => { e.stopPropagation(); onEdit(wallet) }}
            className="p-1.5 text-ink-faint hover:text-ink hover:bg-track rounded-lg transition-colors"
            aria-label="Edit wallet"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(wallet) }}
            className="p-1.5 text-ink-faint hover:text-negative hover:bg-negative-tint rounded-lg transition-colors"
            aria-label="Delete wallet"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
