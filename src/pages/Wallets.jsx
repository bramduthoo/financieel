import { useEffect, useState } from 'react'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import { walletsSummary } from '../lib/walletMetrics'
import WalletCard from '../components/WalletCard'
import WalletModal from '../components/WalletModal'
import SummaryStrip from '../components/ui/SummaryStrip'
import GhostAddCard from '../components/ui/GhostAddCard'
import PageHeader from '../components/ui/PageHeader'

export default function Wallets() {
  const [wallets,      setWallets]      = useState([])
  const [transactions, setTransactions] = useState([])
  const [recurring,    setRecurring]    = useState([])
  const [activePlans,  setActivePlans]  = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editWallet,   setEditWallet]   = useState(null)
  const [createType,   setCreateType]   = useState('fixed')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const now = new Date()

  useEffect(() => { fetchWallets() }, [])

  async function fetchWallets() {
    setLoading(true)
    const [{ data: w }, { data: tx }, { data: rr }, { data: plans }] = await Promise.all([
      supabase.from('wallets').select('*').order('sort_order'),
      supabase.from('transactions').select('wallet_id, type, amount, date'),
      supabase.from('recurring_rules').select('*').is('end_date', null),
      supabase.from('unallocated_plans').select('id').eq('is_active', true),
    ])
    setWallets(w ?? [])
    setTransactions(tx ?? [])
    setRecurring(rr ?? [])
    setActivePlans((plans ?? []).length)
    setLoading(false)
  }

  async function handleSave(values) {
    if (editWallet) {
      await supabase.from('wallets').update(values).eq('id', editWallet.id)
    } else {
      const userId = await getCurrentUserId()
      await supabase.from('wallets').insert({ ...values, user_id: userId })
    }
    setModalOpen(false)
    setEditWallet(null)
    fetchWallets()
  }

  async function handleDelete(wallet) {
    if (wallet.is_system) return
    await supabase.from('wallets').delete().eq('id', wallet.id)
    setDeleteTarget(null)
    fetchWallets()
  }

  function openCreate(type = 'fixed') { setEditWallet(null); setCreateType(type); setModalOpen(true) }
  function openEdit(w)  { setEditWallet(w);    setModalOpen(true) }

  const unallocated = wallets.find(w => w.is_system)
  const groups = [
    { key: 'fixed',      label: 'Fixed',      addLabel: 'Add fixed wallet',      list: wallets.filter(w => w.type === 'fixed'      && !w.is_system) },
    { key: 'variable',   label: 'Variable',   addLabel: 'Add variable wallet',   list: wallets.filter(w => w.type === 'variable'   && !w.is_system) },
    { key: 'investment', label: 'Investment', addLabel: 'Add investment wallet', list: wallets.filter(w => w.type === 'investment' && !w.is_system) },
  ]

  const userWallets = wallets.filter(w => !w.is_system)
  const summary = walletsSummary(wallets)

  function renderCard(w) {
    return (
      <WalletCard
        key={w.id}
        wallet={w}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        transactions={transactions}
        recurringRules={recurring}
        activePlanCount={activePlans}
        now={now}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title="Wallets"
        actions={
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 bg-ink text-cream px-4 py-2 rounded-[9px] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New wallet
          </button>
        }
      />

      {loading ? (
        <p className="text-ink-muted">Loading wallets...</p>
      ) : (
        <>
          {/* Summary strip */}
          <SummaryStrip
            className="mb-8"
            stats={[
              { label: 'Total balance',    value: formatMoney(summary.totalBalance) },
              { label: 'Active wallets',   value: String(summary.activeCount) },
              { label: 'Budgeted / month', value: formatMoney(summary.budgetedPerMonth) },
              { label: 'Unallocated',      value: formatMoney(summary.unallocatedBalance), tone: 'coral' },
            ]}
          />

          {userWallets.length === 0 && !unallocated ? (
            <div className="text-center py-20 text-ink-muted">
              <p className="text-lg font-medium mb-1">No wallets yet</p>
              <p className="text-sm">Create your first wallet to get started</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map(({ key, label, addLabel, list }) =>
                list.length === 0 ? null : (
                  <div key={key}>
                    <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-3">
                      {label}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {list.map(renderCard)}
                      <GhostAddCard label={addLabel} onClick={() => openCreate(key)} />
                    </div>
                  </div>
                )
              )}

              {/* System — the Unallocated wallet lives in its own group. */}
              {unallocated && (
                <div>
                  <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-3">
                    System
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {renderCard(unallocated)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <WalletModal
          wallet={editWallet}
          initialType={createType}
          onClose={() => { setModalOpen(false); setEditWallet(null) }}
          onSave={handleSave}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-card-border rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-ink mb-2">Delete wallet?</h2>
            <p className="text-ink-muted text-sm mb-6">
              <span className="font-medium text-ink">"{deleteTarget.name}"</span> and all
              its transactions will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2 rounded-[9px] bg-negative-bar text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
