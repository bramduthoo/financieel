// Execution status — the FIRST of Phase C's two separate questions (budgeting-phase-C.md §6.1/§6.6):
// "did the plan actually run this month?" One compact full-width line, NOT a summary strip and not a
// card grid. Answers: has each included recurring income been logged this calendar month, when, and
// how the received money split between must-fund wallets and the free pool. A not-logged income is a
// distinct muted state — never rendered as €0 received (§6.3.2).
//
// Every euro via formatMoney() so privacy mode masks this line too.

import { CheckCircle2, CircleDashed } from 'lucide-react'
import { formatMoney } from '../../lib/format'
import { format, parseISO } from 'date-fns'

const fmtDay = d => { try { return format(parseISO(d), 'd MMM') } catch { return d } }

export default function ExecutionStatusLine({ status }) {
  if (!status || status.incomes.length === 0) return null

  const { incomes, anyLogged, receivedTotal, toWallets, toFreePool } = status
  const multi = incomes.length > 1

  return (
    <div className="bg-card border border-card-border rounded-[14px] px-5 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left — logged state (per income when there is more than one) */}
        <div className="min-w-0">
          {incomes.map(row => (
            <div key={row.income.id} className="flex items-center gap-2 text-sm">
              {row.logged
                ? <CheckCircle2 size={15} className="text-positive shrink-0" />
                : <CircleDashed size={15} className="text-ink-faint shrink-0" />}
              <span className="text-ink truncate">{row.income.name}</span>
              <span className={row.logged ? 'text-ink-muted' : 'text-ink-faint'}>
                {row.logged ? `logged ${fmtDay(row.date)}` : 'not logged yet this month'}
              </span>
            </div>
          ))}
        </div>

        {/* Right — what actually landed. Only meaningful once something is logged. */}
        {anyLogged ? (
          <div className="flex items-center gap-5 text-sm shrink-0">
            <Figure label={multi ? 'Received' : 'Received this month'} value={formatMoney(receivedTotal)} tone="text-ink" />
            <Figure label="To wallets" value={formatMoney(toWallets)} tone="text-ink-soft" />
            <Figure label="To free pool" value={formatMoney(toFreePool)} tone="text-accent" />
          </div>
        ) : (
          <span className="text-[11px] uppercase tracking-wider text-ink-faint shrink-0">Awaiting this month</span>
        )}
      </div>
    </div>
  )
}

function Figure({ label, value, tone }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`text-sm font-medium tracking-tight ${tone}`}>{value}</p>
    </div>
  )
}
