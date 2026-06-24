import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import IncomeConfirmModal from '../components/IncomeConfirmModal'
import DistributionPopup from '../components/DistributionPopup'
import { distributeIncome } from '../lib/distributeIncome'

const FREQ_OPTIONS = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
]

function fmtK(n) {
  n = Number(n)
  if (n >= 1000) return `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `€${Math.round(n)}`
}

const inputClass = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

function fmt(n) { return `€${Number(n).toFixed(2)}` }
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
        const fill     = isActive ? '#444441' : '#C0DD97'
        const x        = bX(i)
        const h        = bH(r.amount)
        const y        = bY(r.amount)
        return (
          <g key={r.id}>
            <rect x={x} y={y} width={barW} height={h} fill={fill} rx={3} />
            <text
              x={x + barW / 2} y={y - 6}
              textAnchor="middle" fontSize={10}
              fill={isActive ? '#444441' : '#97C459'}
              fontWeight={isActive ? '600' : '400'}
            >
              {fmtK(r.amount)}
            </text>
            <text
              x={x + barW / 2} y={MT + CH + 18}
              textAnchor="middle" fontSize={9} fill="#9ca3af"
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
        await supabase.from('income_entries').insert({
          amount: Number(logModal.amount),
          source: rule.name,
          date: logModal.date,
          source_type: 'recurring',
          income_recurring_id: rule.id,
        })
        if (distributionRules.length > 0) {
          await distributeIncome({
            distributions: distributionRules.map(dr => ({ wallet_id: dr.wallet_id, amount: Number(dr.amount) })),
            wallets: allWallets,
            unallocatedWalletId,
            sourceName: rule.name,
            date: logModal.date,
            isAutomated: true,
          })
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
        const payload = {
          name: f.name.trim(), amount: Number(f.amount),
          frequency: f.frequency,
          day_of_month: showDay && f.day_of_month ? Number(f.day_of_month) : null,
        }
        if (amountChanged) {
          await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', rule.id)
          await supabase.from('income_recurring').insert({ ...payload, start_date: todayStr(), parent_rule_id: rule.id })
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

  if (loading) return <p className="text-gray-400 p-8">Loading…</p>
  if (!rule)   return <p className="text-gray-400 p-8">Not found.</p>

  const showDay = rule.frequency === 'weekly' || rule.frequency === 'monthly'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/income')}
<<<<<<< HEAD
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-stone-100 rounded-lg transition-colors"
=======
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
>>>>>>> WOUTER
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
<<<<<<< HEAD
          <h1 className="text-xl font-medium text-gray-900 truncate">{rule.name}</h1>
          <p className="text-sm text-gray-600 capitalize mt-0.5">
=======
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 truncate">{rule.name}</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm capitalize mt-0.5">
>>>>>>> WOUTER
            {rule.frequency}{showDay && rule.day_of_month ? ` · day ${rule.day_of_month}` : ''}
          </p>
        </div>
        <button
          onClick={openEdit}
<<<<<<< HEAD
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-stone-100 rounded-lg transition-colors"
=======
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
>>>>>>> WOUTER
        >
          <Edit2 size={15} /> Edit
        </button>
      </div>

      {/* Current amount */}
<<<<<<< HEAD
      <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Current amount</p>
        <p className="text-3xl font-medium tracking-tight text-gray-900">{fmt(rule.amount)}</p>
        <p className="text-sm text-gray-400 mt-1 capitalize">
=======
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Current amount</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{fmt(rule.amount)}</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 capitalize">
>>>>>>> WOUTER
          {rule.frequency} · since {format(parseISO(rule.start_date), 'd MMM yyyy')}
        </p>
      </div>

      {/* Salary growth chart */}
      {chain.length > 0 && (
<<<<<<< HEAD
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Salary growth over time</p>
            <div className="flex items-center gap-4 text-xs text-gray-400">
=======
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Salary growth</h2>
            <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
>>>>>>> WOUTER
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#C0DD97]" /> Archived
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
<<<<<<< HEAD
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Period</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Frequency</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {chain.map(r => (
                <tr key={r.id} className={r.id === rule.id ? 'bg-stone-50' : ''}>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                    {format(parseISO(r.start_date), 'd MMM yyyy')}
                    {r.end_date ? ` – ${format(parseISO(r.end_date), 'd MMM yyyy')}` : ' – present'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 capitalize text-xs">{r.frequency}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{fmt(r.amount)}</td>
                  <td className="px-4 py-2.5">
                    {r.end_date ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-stone-100 text-gray-600">Archived</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-[#EAF3DE] text-[#3B6D11] font-medium">Active</span>
=======
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Period</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Frequency</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {chain.map(r => (
                <tr key={r.id} className={r.id === rule.id ? 'bg-indigo-50/40 dark:bg-indigo-900/20' : ''}>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap text-xs">
                    {format(parseISO(r.start_date), 'd MMM yyyy')}
                    {r.end_date ? ` – ${format(parseISO(r.end_date), 'd MMM yyyy')}` : ' – present'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 capitalize text-xs">{r.frequency}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-800 dark:text-gray-100">{fmt(r.amount)}</td>
                  <td className="px-4 py-2.5">
                    {r.end_date ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-400">Archived</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 font-medium">Active</span>
>>>>>>> WOUTER
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Distribution setup */}
<<<<<<< HEAD
      <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Distribution setup</h2>
=======
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Distribution setup</h2>
>>>>>>> WOUTER
          {distributionRules.length > 0 && (
            <button
              onClick={() => setDistPopupOpen(true)}
              className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Edit distribution
            </button>
          )}
        </div>
        {distributionRules.length === 0 ? (
          <div className="text-center py-4 text-gray-400">
            <p className="text-sm mb-3">No distribution set up</p>
            <button
              onClick={() => setDistPopupOpen(true)}
              className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
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
                    {wallet && (
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: wallet.colour }} />
                    )}
                    <span className="text-gray-700">{wallet?.name ?? '—'}</span>
                  </div>
                  <span className="font-medium text-gray-900">€{Number(dr.amount).toFixed(2)}</span>
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
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Log income
        </button>
        {distSuccess && (
          <span className="text-sm text-[#3B6D11] font-medium">Income distributed.</span>
        )}
      </div>

      {/* Log modal */}
      {logModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Log income</h2>
              <button onClick={() => setLogModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Source: <span className="font-medium text-gray-700">{rule.name}</span></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
                <input
                  type="number" value={logModal.amount}
                  onChange={e => setLogModal(m => ({ ...m, amount: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date" value={logModal.date}
                  onChange={e => setLogModal(m => ({ ...m, date: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setLogModal(null)} className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50">Cancel</button>
              <button onClick={submitLog} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800">Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Edit recurring income</h2>
              <button onClick={() => setEditModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={16} />
              </button>
            </div>
            {editError && <p className="text-[#A32D2D] text-sm mb-3">{editError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  value={editModal.name}
                  onChange={e => setEditModal(f => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€)</label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dayLabel(editModal.frequency)}</label>
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
              <button onClick={() => setEditModal(null)} className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50">Cancel</button>
              <button onClick={submitEdit} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800">Save changes</button>
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
          existingRules={distributionRules.map(dr => ({ wallet_id: dr.wallet_id, amount: Number(dr.amount) }))}
          onClose={() => setDistPopupOpen(false)}
          onConfirm={async (distributions) => {
            await supabase.from('income_distribution_rules').delete().eq('income_recurring_id', id)
            if (distributions.length > 0) {
              await supabase.from('income_distribution_rules').insert(
                distributions.map((d, i) => ({
                  income_recurring_id: id,
                  wallet_id: d.wallet_id,
                  amount: d.amount,
                  priority: i,
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
