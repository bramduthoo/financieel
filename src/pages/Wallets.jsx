import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import WalletCard from '../components/WalletCard'
import WalletModal from '../components/WalletModal'

export default function Wallets() {
  const [wallets,     setWallets]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editWallet,  setEditWallet]  = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { fetchWallets() }, [])

  async function fetchWallets() {
    setLoading(true)
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .order('sort_order')
    setWallets(data ?? [])
    setLoading(false)
  }

  async function handleSave(values) {
    if (editWallet) {
      await supabase.from('wallets').update(values).eq('id', editWallet.id)
    } else {
      await supabase.from('wallets').insert(values)
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

  function openCreate() { setEditWallet(null); setModalOpen(true) }
  function openEdit(w)  { setEditWallet(w);    setModalOpen(true) }

  const groups = [
    { key: 'fixed',      label: 'Fixed wallets',      list: wallets.filter(w => w.type === 'fixed'      && !w.is_system) },
    { key: 'variable',   label: 'Variable wallets',   list: wallets.filter(w => w.type === 'variable'   && !w.is_system) },
    { key: 'investment', label: 'Investment wallets',  list: wallets.filter(w => w.type === 'investment' && !w.is_system) },
    { key: 'system',     label: 'System',              list: wallets.filter(w => w.is_system) },
  ]

  const userWallets = wallets.filter(w => !w.is_system)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
<<<<<<< HEAD
          <h1 className="text-xl font-medium text-gray-900">Wallets</h1>
          <p className="text-sm text-gray-600 mt-0.5">Manage your spending and saving categories</p>
=======
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Wallets</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage your spending and saving categories</p>
>>>>>>> WOUTER
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          New wallet
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading wallets...</p>
      ) : userWallets.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium mb-1">No wallets yet</p>
          <p className="text-sm">Create your first wallet to get started</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ key, label, list }) =>
            list.length === 0 ? null : (
              <div key={key}>
<<<<<<< HEAD
                <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">
=======
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
>>>>>>> WOUTER
                  {label}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map(w => (
                    <WalletCard
                      key={w.id}
                      wallet={w}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <WalletModal
          wallet={editWallet}
          onClose={() => { setModalOpen(false); setEditWallet(null) }}
          onSave={handleSave}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
<<<<<<< HEAD
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Delete wallet?</h2>
            <p className="text-gray-600 text-sm mb-6">
              <span className="font-medium text-gray-700">"{deleteTarget.name}"</span> and all
=======
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Delete wallet?</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              <span className="font-medium text-gray-700 dark:text-gray-200">"{deleteTarget.name}"</span> and all
>>>>>>> WOUTER
              its transactions will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
<<<<<<< HEAD
                className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50"
=======
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
>>>>>>> WOUTER
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2 rounded-lg bg-[#A32D2D] text-white text-sm font-medium hover:bg-[#8a2626]"
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