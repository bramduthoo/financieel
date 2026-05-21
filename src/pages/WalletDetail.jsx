import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import RecurringRules from '../components/RecurringRules'
import TransactionChecklist from '../components/TransactionChecklist'
import UpcomingPayments from '../components/UpcomingPayments'
import PaymentHistory from '../components/PaymentHistory'
import WalletModal from '../components/WalletModal'

export default function WalletDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [wallet,   setWallet]   = useState(null)
  const [rules,    setRules]    = useState([])
  const [transactions, setTransactions] = useState([])
  const [tab,      setTab]      = useState('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [loading,  setLoading]  = useState(true)

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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/wallets')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: wallet.colour }} />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{wallet.name}</h1>
              <p className="text-gray-400 text-sm capitalize">
                {wallet.type} · {wallet.budget_type.replace('-', ' ')}
                {wallet.type !== 'investment' &&
                  ` · €${Number(wallet.budget).toFixed(2)}/mo`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Balance pill */}
          <div className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
            Number(wallet.balance) >= 0
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}>
            Balance: €{Number(wallet.balance).toFixed(2)}
          </div>
          <button onClick={() => setEditOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings size={15} /> Settings
          </button>
        </div>
      </div>

      {/* Tabs */}
      {wallet.type === 'fixed' && (
        <>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
            {['overview', 'history'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Pending checklist */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <TransactionChecklist
                  walletId={id}
                  onBalanceChanged={fetchAll}
                />
              </div>

              {/* Upcoming payments */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <UpcomingPayments rules={rules} transactions={transactions} />
              </div>

              {/* Recurring payments manager */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <RecurringRules
                  walletId={id}
                  onRulesChanged={fetchAll}
                />
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <PaymentHistory walletId={id} />
            </div>
          )}
        </>
      )}

      {wallet.type === 'variable' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-400 text-sm">Variable wallet features coming in Phase 5.</p>
        </div>
      )}

      {wallet.type === 'investment' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-400 text-sm">Investment wallet features coming in Phase 7.</p>
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