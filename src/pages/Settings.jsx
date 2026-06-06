import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function SettingCard({ label, description, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          {description && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()

  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saved,    setSaved]    = useState(false)
  const timerRef = useRef(null)

  const [userEmail,     setUserEmail]     = useState(null)
  const [deleteModal,   setDeleteModal]   = useState(null)  // null | 'warning' | 'code'
  const [otpCode,       setOtpCode]       = useState('')
  const [deleteError,   setDeleteError]   = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  useEffect(() => {
    fetchSettings()
    fetchUserEmail()
  }, [])

  async function fetchSettings() {
    const { data } = await supabase.from('settings').select('*').single()
    setSettings(data)
    setLoading(false)
  }

  async function fetchUserEmail() {
    const { data: { user } } = await supabase.auth.getUser()
    setUserEmail(user?.email ?? null)
  }

  async function updateSetting(field, value) {
    if (!settings?.id) return
    await supabase.from('settings').update({ [field]: value }).eq('id', settings.id)
    setSettings(prev => ({ ...prev, [field]: value }))
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  async function sendOtp() {
    if (!userEmail) return
    setDeleteLoading(true)
    await supabase.auth.signInWithOtp({
      email: userEmail,
      options: { shouldCreateUser: false },
    })
    setDeleteLoading(false)
    setDeleteModal('code')
  }

  async function confirmDeletion() {
    if (!otpCode.trim()) return
    setDeleteLoading(true)
    setDeleteError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: userEmail,
      token: otpCode.trim(),
      type: 'email',
    })
    if (error) {
      setDeleteError('Invalid or expired code. Please try again.')
      setDeleteLoading(false)
      return
    }
    await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('income_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('budget_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('wallets').update({ balance: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
    setDeleteLoading(false)
    setDeleteModal(null)
    setOtpCode('')
    setDeleteSuccess(true)
    setTimeout(() => navigate('/'), 1500)
  }

  function closeDeleteModals() {
    setDeleteModal(null)
    setOtpCode('')
    setDeleteError(null)
  }

  if (loading) return <p className="text-gray-400">Loading settings...</p>
  if (!settings) return <p className="text-gray-400">No settings found.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">App preferences and configuration</p>
        </div>
        <span
          className={`text-sm font-medium text-green-600 transition-opacity duration-500 ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Saved
        </span>
      </div>

      <div className="max-w-2xl space-y-4">
        <SettingCard
          label="Currency"
          description="The currency used throughout the app."
        >
          <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">
            EUR €
          </span>
        </SettingCard>

        <SettingCard
          label="Month start day"
          description="The day of the month that your budget period begins."
        >
          <input
            type="number"
            min={1}
            max={28}
            value={settings.month_start_day ?? 1}
            onChange={e => {
              const v = Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1))
              updateSetting('month_start_day', v)
            }}
            className="w-20 text-center text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </SettingCard>

        <SettingCard
          label="Theme"
          description="Switch between light and dark mode. Dark mode is saved but not yet applied visually."
        >
          <div className="flex items-center gap-3">
            <span className={`text-sm ${settings.theme === 'light' ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
              Light
            </span>
            <Toggle
              checked={settings.theme === 'dark'}
              onChange={isDark => updateSetting('theme', isDark ? 'dark' : 'light')}
            />
            <span className={`text-sm ${settings.theme === 'dark' ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
              Dark
            </span>
          </div>
        </SettingCard>

        <SettingCard
          label="Strict distribution"
          description={
            settings.strict_distribution
              ? 'ON: 100% of income must always be assigned to wallets.'
              : 'OFF: unassigned income goes to the Unallocated wallet automatically.'
          }
        >
          <div className="flex items-center gap-3">
            <span className={`text-sm ${!settings.strict_distribution ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
              OFF
            </span>
            <Toggle
              checked={settings.strict_distribution ?? true}
              onChange={val => updateSetting('strict_distribution', val)}
            />
            <span className={`text-sm ${settings.strict_distribution ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
              ON
            </span>
          </div>
        </SettingCard>

        {/* Danger zone */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Delete all data</p>
              <p className="text-xs text-red-600 mt-1 leading-relaxed">
                Permanently deletes all transactions, income history and wallet balances. Your wallet structure and payment rules are kept. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setDeleteModal('warning')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
            >
              <AlertTriangle size={14} />
              Delete all data
            </button>
          </div>
        </div>
      </div>

      {/* ── Warning modal ──────────────────────────────────────────────────────── */}
      {deleteModal === 'warning' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Are you sure?</h2>
            <p className="text-sm text-gray-600 mb-3">The following will be permanently deleted:</p>
            <ul className="text-sm text-gray-700 space-y-1.5 mb-3 ml-1">
              <li>• All transactions</li>
              <li>• All income entries</li>
              <li>• All wallet balances (reset to €0)</li>
              <li>• All budget allocation history</li>
            </ul>
            <p className="text-sm font-semibold text-red-600 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={closeDeleteModals}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendOtp}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Sending…' : 'Send confirmation code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Code modal ─────────────────────────────────────────────────────────── */}
      {deleteModal === 'code' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 mb-4">
              We sent a 6-digit confirmation code to{' '}
              <span className="font-medium text-gray-700">{userEmail}</span>.
              Enter it below to confirm deletion.
            </p>
            {deleteError && <p className="text-red-500 text-sm mb-3">{deleteError}</p>}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={closeDeleteModals}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletion}
                disabled={deleteLoading || otpCode.length < 6}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Confirm deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success toast ──────────────────────────────────────────────────────── */}
      {deleteSuccess && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          All data deleted successfully
        </div>
      )}
    </div>
  )
}
