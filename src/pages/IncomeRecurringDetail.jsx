import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Edit2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase, getCurrentUserId } from '../lib/supabase'
import IncomeConfirmModal from '../components/IncomeConfirmModal'
import DistributionPopup from '../components/DistributionPopup'
import { distributeIncome } from '../lib/distributeIncome'
import { evaluateUnallocatedPlans } from '../lib/unallocatedPlans'
import { formatMoney, formatMoneyCompact } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'
import PageHeader from '../components/ui/PageHeader'

const FREQ_OPTIONS = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
]

const fmtK = formatMoneyCompact

const inputClass = 'w-full px-3 py-2 border border-card-border rounded-[8px] text-sm bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30'

function fmt(n) { return formatMoney(n) }
function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function buildChain(ruleId, allRules) {
  const chain = []
  let current = allRules.find(r => r.id === ruleId)
  while (current) {
    chain.push(current)
    if (!current.parent_rule_id) break
    current = allRules.find(r => r.id === current.parent_rule_id)
  }
  return chain.reverse()
}

function dayLabel(frequency) {
  if (frequency === 'weekly')  return 'Day of week (1 = Mon, 7 = Sun)'
  if (frequency === 'monthly') return 'Day of month (1–31)'
  return 'Day of month'
}

// SVG constants
const CW = 480, CH = 100, MT = 32, MB = 32, ML = 10, MR = 10
const SVG_W = CW + ML + MR
const SVG_H = CH + MT + MB

function SalaryBarChart({ chain }) {
  if (!chain || chain.length === 0) return null

  const maxAmt = Math.max(...chain.map(r => Number(r.amount)))
  const slotW  = CW / chain.length
  const barW   = Math.min(slotW * 0.55, 64)

  function bH(val) { return (Number(val) / maxAmt) * CH }
  function bY(val) { return MT + CH - bH(val) }
  function bX(i)   { return ML + i * slotW + (slotW - barW) / 2 }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%">
      {chain.map((r, i) => {
        const isActive = !r.end_date
        const x        = bX(i)
        const h        = bH(r.amount)
        const y        = bY(r.amount)
        return (
          <g key={r.id}>
            <rect x={x} y={y} width={barW} height={h} className={isActive ? 'fill-ink' : 'fill-positive-bar'} rx={3} />
            <text
              x={x + barW / 2} y={y - 6}
              textAnchor="middle" fontSize={10}
              className={isActive ? 'fill-ink' : 'fill-positive'}
              fontWeight={isActive ? '500' : '400'}
            >
              {fmtK(r.amount)}
            </text>
            <text
              x={x + barW / 2} y={MT + CH + 18}
              textAnchor="middle" fontSize={9} className="fill-ink-faint"
            >
              {format(parseISO(r.start_date), 'MMM yy')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function IncomeRecurringDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [rule,     setRule]     = useState(null)
  const [allRules, setAllRules] = useState([])
  const [loading,  setLoading]  = useState(true)

  const [logModal,  setLogModal]  = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [editError, setEditError] = useState(null)
  const [confirm,   setConfirm]   = useState(null)

  const [distributionRules,   setDistributionRules]   = useState([])
  const [allWallets,          setAllWallets]           = useState([])
  const [unallocatedWalletId, setUnallocatedWalletId] = useState(null)
  const [distPopupOpen,       setDistPopupOpen]       = useState(false)
  const [distSuccess,         setDistSuccess]         = useState(false)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    const [{ data: r }, { data: all }, { data: dr }, { data: w }, { data: ua }] = await Promise.all([
      supabase.from('income_recurring').select('*').eq('id', id).single(),
      supabase.from('income_recurring').select('*').order('start_date', { ascending: true }),
      supabase.from('income_distribution_rules').select('*').eq('income_recurring_id', id).order('priority'),
      supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('wallets').select('id').eq('is_system', true).single(),
    ])
    setRule(r)
    setAllRules(all ?? [])
    setDistributionRules(dr ?? [])
    setAllWallets(w ?? [])
    setUnallocatedWalletId(ua?.id ?? null)
    setLoading(false)
    // "Log now" from the Income page navigates here with { state: { log: true } } — open the
    // existing log modal once the rule is loaded, then clear the nav state so a refresh/back
    // doesn't reopen it. Reuses the existing log flow; adds no new logging logic.
    if (location.state?.log && r) {
      setLogModal({ amount: String(r.amount), date: todayStr() })
      navigate(location.pathname, { replace: true, state: {} })
    }
  }

  const chain = useMemo(() => {
    if (!rule || allRules.length === 0) return []
    return buildChain(rule.id, allRules)
  }, [rule, allRules])

  // ─── Log income ────────────────────────────────────────────────────────────

  function submitLog() {
    if (!logModal.amount || isNaN(Number(logModal.amount)) || Number(logModal.amount) <= 0) return
    if (!logModal.date) return
    setConfirm({
      title: 'Log income?',
      body: (
        <span>
          Log <strong>{fmt(logModal.amount)}</strong> from <strong>{rule.name}</strong> on{' '}
          {format(parseISO(logModal.date), 'd MMM yyyy')}?
        </span>
      ),
      confirmLabel: 'Log income', variant: 'primary',
      onConfirm: async () => {
        const userId = await getCurrentUserId()
        const { data: ent } = await supabase.from('income_entries').insert({
          amount: Number(logModal.amount),
          source: rule.name,
          date: logModal.date,
          source_type: 'recurring',
          income_recurring_id: rule.id,
          user_id: userId,
        }).select().single()
        if (distributionRules.length > 0) {
          await distributeIncome({
            distributions: distributionRules.map(dr => ({ wallet_id: dr.wallet_id, amount: Number(dr.amount) })),
            wallets: allWallets,
            unallocatedWalletId,
            sourceName: rule.name,
            date: logModal.date,
            isAutomated: true,
            userId,
            incomeEntryId: ent?.id ?? null,
          })
          // Check-on-change: an income distribution may have credited Unallocated.
          await evaluateUnallocatedPlans(unallocatedWalletId)
          setDistSuccess(true)
          setTimeout(() => setDistSuccess(false), 3000)
        }
        setLogModal(null)
        setConfirm(null)
      },
    })
  }

  // ─── Edit rule ─────────────────────────────────────────────────────────────

  function openEdit() {
    setEditError(null)
    setEditModal({
      name: rule.name,
      amount: String(rule.amount),
      originalAmount: rule.amount,
      frequency: rule.frequency,
      day_of_month: String(rule.day_of_month ?? '1'),
    })
  }

  function submitEdit() {
    const f = editModal
    if (!f.name.trim())                                              { setEditError('Enter a name.'); return }
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) { setEditError('Enter a valid amount.'); return }
    setEditError(null)

    const amountChanged = Number(f.amount) !== Number(f.originalAmount)
    const showDay       = f.frequency === 'weekly' || f.frequency === 'monthly'

    const title = amountChanged ? 'Archive & update amount?' : 'Update recurring income?'
    const body  = amountChanged
      ? <span>Change <strong>{f.name}</strong> from <strong>{fmt(f.originalAmount)}</strong> to <strong>{fmt(f.amount)}</strong>. The current version will be archived.</span>
      : <span>Update <strong>{f.name}</strong> ({fmt(f.amount)}, {f.frequency})?</span>

    setConfirm({
      title, body, variant: 'primary', confirmLabel: 'Save changes',
      onConfirm: async () => {
        const userId = await getCurrentUserId()
        const payload = {
          name: f.name.trim(), amount: Number(f.amount),
          frequency: f.frequency,
          day_of_month: showDay && f.day_of_month ? Number(f.day_of_month) : null,
        }
        if (amountChanged) {
          await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', rule.id)
          await supabase.from('income_recurring').insert({ ...payload, start_date: todayStr(), parent_rule_id: rule.id, user_id: userId })
          setConfirm(null)
          setEditModal(null)
          navigate('/income')
        } else {
          await supabase.from('income_recurring').update({
            name: payload.name, frequency: payload.frequency, day_of_month: payload.day_of_month,
          }).eq('id', rule.id)
          setConfirm(null)
          setEditModal(null)
          fetchData()
        }
      },
    })
  }

  if (loading) return <p className="text-ink-faint p-8">Loading…</p>
  if (!rule)   return <p className="text-ink-faint p-8">Not found.</p>

  const showDay = rule.frequency === 'weekly' || rule.frequency === 'monthly'

  return (
    <div>
      <PageHeader
        eyebrow="Income"
        eyebrowTo="/income"
        title={rule.name}
        meta={
          <span className="capitalize">
            {rule.frequency}{showDay && rule.day_of_month ? ` · day ${rule.day_of_month}` : ''}
          </span>
        }
        actions={
          <button
            onClick={openEdit}
            className="flex items-center gap-2 px-3 py-2 text-sm text-ink-soft hover:bg-track rounded-lg transition-colors"
          >
            <Edit2 size={15} /> Edit
          </button>
        }
      />

      {/* Current amount */}
      <div className="bg-card rounded-[14px] border border-card-border p-5 mb-6">
        <p className="text-xs text-ink-faint mb-1">Current amount</p>
        <p className="text-3xl font-medium text-ink dark:text-ink">{fmt(rule.amount)}</p>
        <p className="text-sm text-ink-faint mt-1 capitalize">
          {rule.frequency} · since {format(parseISO(rule.start_date), 'd MMM yyyy')}
        </p>
      </div>

      {/* Salary growth chart */}
      {chain.length > 0 && (
        <div className="bg-card rounded-[14px] border border-card-border p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium text-ink">Salary growth</h2>
            <div className="flex items-center gap-4 text-xs text-ink-faint">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-positive-bar" /> Archived
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#444441]" /> Current
              </span>
            </div>
          </div>
          <SalaryBarChart chain={chain} />
        </div>
      )}

      {/* Version history table */}
      {chain.length > 1 && (
        <div className="bg-card rounded-[14px] border border-card-border overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-track border-b border-card-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">Period</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">Frequency</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-muted uppercase tracking-wide">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-inner-border">
              {chain.map(r => (
                <tr key={r.id} className={r.id === rule.id ? 'bg-accent/5' : 'even:bg-field'}>
                  <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap text-xs">
                    {format(parseISO(r.start_date), 'd MMM yyyy')}
                    {r.end_date ? ` – ${format(parseISO(r.end_date), 'd MMM yyyy')}` : ' – present'}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft capitalize text-xs">{r.frequency}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-ink">{fmt(r.amount)}</td>
                  <td className="px-4 py-2.5">
                    {r.end_date ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-track text-ink-faint dark:text-ink-faint">Archived</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent font-medium">Active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Distribution setup */}
      <div className="bg-card rounded-[14px] border border-card-border p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">Distribution setup</h2>
          {distributionRules.length > 0 && (
            <button
              onClick={() => setDistPopupOpen(true)}
              className="bg-ink text-cream text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-colors"
            >
              Edit distribution
            </button>
          )}
        </div>
        {distributionRules.length === 0 ? (
          <div className="text-center py-4 text-ink-faint">
            <p className="text-sm mb-3">No distribution set up</p>
            <button
              onClick={() => setDistPopupOpen(true)}
              className="bg-ink text-cream text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-colors"
            >
              Set up distribution
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {distributionRules.map(dr => {
              const wallet = allWallets.find(w => w.id === dr.wallet_id)
              return (
                <div key={dr.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {wallet && <WalletIcon wallet={wallet} size={14} className="text-ink-soft flex-shrink-0" />}
                    <span className="text-ink">{wallet?.name ?? '—'}</span>
                  </div>
                  <span className="font-medium text-ink">
                    {dr.mode === 'percent'
                      ? `${Number(dr.value)}% · ${formatMoney(Number(dr.amount))}`
                      : formatMoney(Number(dr.amount))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Log income button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setLogModal({ amount: String(rule.amount), date: todayStr() })}
          className="flex items-center gap-2 bg-ink text-cream px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
        >
          Log income
        </button>
        {distSuccess && (
          <span className="text-sm text-positive font-medium">Income distributed.</span>
        )}
      </div>

      {/* Log modal */}
      {logModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-ink">Log income</h2>
              <button onClick={() => setLogModal(null)} className="p-1.5 text-ink-faint hover:text-ink-soft rounded-lg">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-ink-muted mb-4">Source: <span className="font-medium text-ink">{rule.name}</span></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Amount (€)</label>
                <input
                  type="number" value={logModal.amount}
                  onChange={e => setLogModal(m => ({ ...m, amount: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Date</label>
                <input
                  type="date" value={logModal.date}
                  onChange={e => setLogModal(m => ({ ...m, date: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setLogModal(null)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
              <button onClick={submitLog} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-ink">Edit recurring income</h2>
              <button onClick={() => setEditModal(null)} className="p-1.5 text-ink-faint hover:text-ink-soft rounded-lg">
                <X size={16} />
              </button>
            </div>
            {editError && <p className="text-negative text-sm mb-3">{editError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
                <input
                  value={editModal.name}
                  onChange={e => setEditModal(f => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Amount (€)</label>
                <input
                  type="number" value={editModal.amount}
                  onChange={e => setEditModal(f => ({ ...f, amount: e.target.value }))}
                  className={inputClass}
                />
                {editModal.amount && Number(editModal.amount) !== Number(editModal.originalAmount) && (
                  <p className="text-xs text-[#854F0B] mt-1">Changing the amount will archive the current version.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Frequency</label>
                <select
                  value={editModal.frequency}
                  onChange={e => setEditModal(f => ({ ...f, frequency: e.target.value }))}
                  className={inputClass}
                >
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {(editModal.frequency === 'weekly' || editModal.frequency === 'monthly') && (
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1">{dayLabel(editModal.frequency)}</label>
                  <input
                    type="number" value={editModal.day_of_month}
                    onChange={e => setEditModal(f => ({ ...f, day_of_month: e.target.value }))}
                    min={1} max={editModal.frequency === 'weekly' ? 7 : 31}
                    className={inputClass}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2 rounded-lg border border-card-border text-sm text-ink-soft hover:bg-track">Cancel</button>
              <button onClick={submitEdit} className="flex-1 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:opacity-90">Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirm && (
        <IncomeConfirmModal
          title={confirm.title}
          body={confirm.body}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
        />
      )}

      {/* Distribution setup / edit popup */}
      {distPopupOpen && (
        <DistributionPopup
          totalAmount={Number(rule.amount)}
          strictMode={true}
          existingRules={distributionRules.map(dr => ({
            wallet_id: dr.wallet_id,
            mode: dr.mode ?? 'euro',
            value: Number(dr.value ?? dr.amount),
          }))}
          onClose={() => setDistPopupOpen(false)}
          onConfirm={async (distributions, meta) => {
            await supabase.from('income_distribution_rules').delete().eq('income_recurring_id', id)
            const ruleRows = meta?.allRows ?? []
            if (ruleRows.length > 0) {
              const userId = await getCurrentUserId()
              await supabase.from('income_distribution_rules').insert(
                ruleRows.map((r, i) => ({
                  income_recurring_id: id,
                  wallet_id: r.wallet_id,
                  mode: r.mode,
                  value: r.value,
                  amount: r.amount,
                  priority: i,
                  user_id: userId,
                }))
              )
            }
            setDistPopupOpen(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}
