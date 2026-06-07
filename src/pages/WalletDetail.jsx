import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import RecurringRules from '../components/RecurringRules'
import TransactionChecklist from '../components/TransactionChecklist'
import UpcomingPayments from '../components/UpcomingPayments'
import PaymentHistory from '../components/PaymentHistory'
import WalletModal from '../components/WalletModal'
import VariableOverview from '../components/VariableOverview'
import VariableHistory from '../components/VariableHistory'
import WalletTrendsChart from '../components/WalletTrendsChart'

export default function WalletDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [wallet,       setWallet]       = useState(null)
  const [rules,        setRules]        = useState([])
  const [transactions, setTransactions] = useState([])
  const [tab,          setTab]          = useState('overview')
  const [editOpen,     setEditOpen]     = useState(false)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { fetchAll(true) }, [id])

  async function fetchAll(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const [{ data: w }, { data: r }, { data: t }] = await Promise.all([
      supabase.from('wallets').select('*').eq('id', id).single(),
      supabase.from('recurring_rules').select('*')
        .eq('wallet_id', id).is('end_date', null).order('created_at'),
      supabase.from('transactions').select('*').eq('wallet_id', id),
    ])
    setWallet(w)
    setRules(r ?? [])
    setTransactions(t ?? [])
    setLoading(false)
  }

  async function handleSave(values) {
    await supabase.from('wallets').update(values).eq('id', id)
    setEditOpen(false)
    fetchAll()
  }

  if (loading) return <p className="text-gray-400 p-8">Loading...</p>
  if (!wallet)  return <p className="text-gray-400 p-8">Wallet not found.</p>

  // Spending bar for variable wallets — computed from already-fetched transactions
  const now          = new Date()
  const monthFrom    = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthTo      = format(endOfMonth(now),   'yyyy-MM-dd')
  const monthDebits  = wallet.type === 'variable'
    ? transactions
        .filter(t => t.type === 'debit' && t.date >= monthFrom && t.date <= monthTo)
        .reduce((s, t) => s + Number(t.amount), 0)
    : 0
  const budget       = Number(wallet.budget)
  const pct          = budget > 0 ? (monthDebits / budget) * 100 : 0
  const barColour    = pct >= 100 ? 'bg-[#A32D2D]' : pct >= 75 ? 'bg-[#854F0B]' : 'bg-[#3B6D11]'
  const textColour   = pct >= 100 ? 'text-[#A32D2D]' : pct >= 75 ? 'text-[#854F0B]' : 'text-[#3B6D11]'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/wallets')}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: wallet.colour }} />
            <div>
              <h1 className="text-xl font-medium text-gray-900">{wallet.name}</h1>
              <p className="text-sm text-gray-600 capitalize">
                {wallet.type === 'unallocated'
                  ? 'System wallet'
                  : `${wallet.type} · ${wallet.budget_type.replace('-', ' ')}${wallet.type !== 'investment' ? ` · €${Number(wallet.budget).toFixed(2)}/mo` : ''}`
                }
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Compact spending bar — variable wallets only */}
          {wallet.type === 'variable' && (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{format(now, 'MMMM')} spending</span>
                <span className={`text-xs font-medium ml-2 ${textColour}`}>{pct.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${barColour}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                €{monthDebits.toFixed(2)} / €{budget.toFixed(2)}
              </p>
            </div>
          )}

          {/* Balance pill */}
          <div className={`px-4 py-1.5 rounded-full text-sm font-medium ${
            Number(wallet.balance) >= 0
              ? 'bg-[#EAF3DE] text-[#3B6D11]'
              : 'bg-[#FCEBEB] text-[#A32D2D]'
          }`}>
            Balance: €{Number(wallet.balance).toFixed(2)}
          </div>

          {!wallet.is_system && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-stone-100 rounded-lg transition-colors"
            >
              <Settings size={15} /> Settings
            </button>
          )}
        </div>
      </div>

      {/* ── Fixed wallet ──────────────────────────────────────────────────────── */}
      {wallet.type === 'fixed' && (
        <>
          <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit mb-6">
            {['overview', 'history'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  tab === t ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <TransactionChecklist walletId={id} onBalanceChanged={fetchAll} />
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <UpcomingPayments rules={rules} transactions={transactions} />
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <RecurringRules walletId={id} onRulesChanged={fetchAll} />
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
              <PaymentHistory walletId={id} />
            </div>
          )}
        </>
      )}

      {/* ── Variable wallet ───────────────────────────────────────────────────── */}
      {wallet.type === 'variable' && (
        <>
          <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit mb-6">
            {['overview', 'history', 'trends'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  tab === t ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <VariableOverview
              walletId={id}
              onBalanceChanged={fetchAll}
            />
          )}

          {tab === 'history' && (
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
              <VariableHistory walletId={id} />
            </div>
          )}

          {tab === 'trends' && (
            <WalletTrendsChart walletId={id} wallet={wallet} />
          )}
        </>
      )}

      {/* ── Investment wallet ─────────────────────────────────────────────────── */}
      {wallet.type === 'investment' && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <p className="text-gray-400 text-sm">Investment wallet features coming in Phase 7.</p>
        </div>
      )}

      {/* ── Unallocated wallet ────────────────────────────────────────────────── */}
      {wallet.type === 'unallocated' && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-sm text-gray-600 leading-relaxed">
              This wallet automatically collects unassigned income and overflow from capped wallets.
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-4">Incoming transactions</h2>
            {transactions.filter(t => t.type === 'credit').length === 0 ? (
              <p className="text-gray-400 text-sm">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {transactions
                  .filter(t => t.type === 'credit')
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map(t => (
                    <div key={t.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t.name || t.note || 'Credit'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(t.date), 'dd MMM yyyy')}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-[#3B6D11]">
                        +€{Number(t.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editOpen && (
        <WalletModal
          wallet={wallet}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
