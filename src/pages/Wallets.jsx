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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Wallets</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your spending and saving categories</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
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
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {label}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Delete wallet?</h2>
            <p className="text-gray-500 text-sm mb-6">
              <span className="font-medium text-gray-700">"{deleteTarget.name}"</span> and all
              its transactions will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600"
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