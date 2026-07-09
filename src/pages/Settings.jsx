import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, LogOut } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import IncomeConfirmModal from '../components/IncomeConfirmModal'

const authInputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100'

// Two-tier reset copy. Mirrors reset_user_data(p_full) exactly (Task B).
const RESET_TIERS = {
  activity: {
    title: 'Clear activity?',
    deleted: [
      'All transactions',
      'All income entries',
      'All budget allocation history',
      'Any pending unallocated conflicts',
      'All wallet balances (reset to €0)',
    ],
    kept: 'Your wallets, distribution rules, recurring income, templates and plans are kept.',
  },
  full: {
    title: 'Full reset?',
    deleted: [
      'All transactions, income entries and budget allocations',
      'All wallet balances (reset to €0)',
      'Your distribution rules and recurring income & rules',
      'Your income templates',
      'Your unallocated templates and plans',
    ],
    kept: 'Your wallets (including Unallocated) and your settings are kept.',
  },
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <div
        className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function SettingCard({ label, description, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</p>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{description}</p>
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
  const { setTheme } = useTheme()

  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saved,    setSaved]    = useState(false)
  const timerRef = useRef(null)

  const [userEmail,     setUserEmail]     = useState(null)
  const [memberSince,   setMemberSince]   = useState(null)
  const [deleteModal,   setDeleteModal]   = useState(null)  // null | 'warning' | 'code'
  const [deleteTier,    setDeleteTier]    = useState(null)  // 'activity' | 'full'
  const [otpCode,       setOtpCode]       = useState('')
  const [deleteError,   setDeleteError]   = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  // Password change (Task C)
  const [pwCurrent,  setPwCurrent]  = useState('')
  const [pwNew,      setPwNew]      = useState('')
  const [pwConfirm,  setPwConfirm]  = useState('')
  const [pwError,    setPwError]    = useState(null)
  const [pwSuccess,  setPwSuccess]  = useState(false)
  const [pwLoading,  setPwLoading]  = useState(false)

  // Log out of all devices (Task F)
  const [logoutAllModal,   setLogoutAllModal]   = useState(false)
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)
  const [logoutAllError,   setLogoutAllError]   = useState(null)

  useEffect(() => {
    fetchSettings()
    fetchUser()
  }, [])

  async function fetchSettings() {
    const { data } = await supabase.from('settings').select('*').single()
    setSettings(data)
    setLoading(false)
  }

  async function fetchUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUserEmail(user?.email ?? null)
    setMemberSince(user?.created_at ?? null)
  }

  function clearPwFeedback() {
    if (pwError) setPwError(null)
    if (pwSuccess) setPwSuccess(false)
  }

  async function handlePasswordChange() {
    setPwError(null)
    setPwSuccess(false)
    if (!userEmail) { setPwError('Could not determine your account email. Please reload.'); return }
    if (pwNew.length < 8) { setPwError('New password must be at least 8 characters.'); return }
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match.'); return }
    if (pwNew === pwCurrent) { setPwError('New password must be different from the current one.'); return }

    setPwLoading(true)
    // Verify the current password by re-authenticating before changing it.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: pwCurrent,
    })
    if (signInErr) {
      setPwError('Current password is incorrect.')
      setPwLoading(false)
      return
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: pwNew })
    if (updateErr) {
      setPwError(updateErr.message)
      setPwLoading(false)
      return
    }
    setPwCurrent('')
    setPwNew('')
    setPwConfirm('')
    setPwSuccess(true)
    setPwLoading(false)
  }

  async function handleLogoutAll() {
    if (logoutAllLoading) return
    setLogoutAllLoading(true)
    setLogoutAllError(null)
    // Global scope revokes every session including this one; the auth listener
    // in App.jsx then redirects to /login (which also unmounts this page).
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      setLogoutAllError('Could not log out of all devices. Please try again.')
      setLogoutAllLoading(false)
      return
    }
    // On success the auth listener redirects/unmounts — no further state set.
  }

  async function updateSetting(field, value) {
    if (!settings?.id) return
    await supabase.from('settings').update({ [field]: value }).eq('id', settings.id)
    setSettings(prev => ({ ...prev, [field]: value }))
    if (field === 'theme') setTheme(value)
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
    // All deletes + balance resets happen inside the transactional RPC
    // (auth.uid()-scoped). p_full distinguishes the two tiers.
    const { error: rpcError } = await supabase.rpc('reset_user_data', {
      p_full: deleteTier === 'full',
    })
    if (rpcError) {
      setDeleteError('Something went wrong while resetting your data. Please try again.')
      setDeleteLoading(false)
      return
    }
    setDeleteLoading(false)
    setDeleteModal(null)
    setDeleteTier(null)
    setOtpCode('')
    setDeleteSuccess(true)
    setTimeout(() => navigate('/'), 1500)
  }

  function openDelete(tier) {
    setDeleteTier(tier)
    setDeleteError(null)
    setDeleteModal('warning')
  }

  function closeDeleteModals() {
    setDeleteModal(null)
    setDeleteTier(null)
    setOtpCode('')
    setDeleteError(null)
  }

  if (loading) return <p className="text-gray-400">Loading settings...</p>
  if (!settings) return <p className="text-gray-400">No settings found.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">App preferences and configuration</p>
        </div>
        <span
          className={`text-sm font-medium text-[#3B6D11] transition-opacity duration-500 ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Saved
        </span>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Profile (Task D) */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Profile</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">Your account details.</p>
          <dl className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-6">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{userEmail ?? '—'}</dd>
            </div>
            {memberSince && (
              <div className="flex items-center justify-between gap-6">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Member since</dt>
                <dd className="text-sm font-medium text-gray-800 dark:text-gray-100">{format(new Date(memberSince), 'd MMM yyyy')}</dd>
              </div>
            )}
          </dl>
        </div>

        <SettingCard
          label="Currency"
          description="The currency used throughout the app."
        >
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg">
            EUR €
          </span>
        </SettingCard>

        <SettingCard
          label="Theme"
          description="Switch between light and dark mode."
        >
          <div className="flex items-center gap-3">
            <span className={`text-sm ${settings.theme === 'light' ? 'text-gray-800 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
              Light
            </span>
            <Toggle
              checked={settings.theme === 'dark'}
              onChange={isDark => updateSetting('theme', isDark ? 'dark' : 'light')}
            />
            <span className={`text-sm ${settings.theme === 'dark' ? 'text-gray-800 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
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
            <span className={`text-sm ${!settings.strict_distribution ? 'text-gray-800 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
              OFF
            </span>
            <Toggle
              checked={settings.strict_distribution ?? true}
              onChange={val => updateSetting('strict_distribution', val)}
            />
            <span className={`text-sm ${settings.strict_distribution ? 'text-gray-800 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
              ON
            </span>
          </div>
        </SettingCard>

        {/* Password change (Task C) */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Change password</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
            Enter your current password, then choose a new one (at least 8 characters).
          </p>

          {pwError && (
            <div className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-lg mt-4">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="bg-green-50 dark:bg-green-950/40 text-[#3B6D11] dark:text-green-400 text-sm px-4 py-3 rounded-lg mt-4">
              Password updated successfully.
            </div>
          )}

          <div className="space-y-3 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Current password</label>
              <input
                type="password"
                value={pwCurrent}
                onChange={e => { setPwCurrent(e.target.value); clearPwFeedback() }}
                autoComplete="current-password"
                placeholder="••••••••"
                className={authInputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">New password</label>
              <input
                type="password"
                value={pwNew}
                onChange={e => { setPwNew(e.target.value); clearPwFeedback() }}
                autoComplete="new-password"
                placeholder="••••••••"
                className={authInputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Confirm new password</label>
              <input
                type="password"
                value={pwConfirm}
                onChange={e => { setPwConfirm(e.target.value); clearPwFeedback() }}
                onKeyDown={e => e.key === 'Enter' && handlePasswordChange()}
                autoComplete="new-password"
                placeholder="••••••••"
                className={authInputClass}
              />
            </div>
            <button
              onClick={handlePasswordChange}
              disabled={pwLoading || !pwCurrent || !pwNew || !pwConfirm}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {pwLoading ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </div>

        {/* Log out of all devices (Task F) */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Log out of all devices</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Ends every active session, including this one. You'll need to sign in again everywhere.
              </p>
            </div>
            <button
              onClick={() => { setLogoutAllError(null); setLogoutAllModal(true) }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
              Log out everywhere
            </button>
          </div>
        </div>

        {/* Danger zone (Task B — two tiers) */}
        <div className="bg-[#FCEBEB] border border-[#F7C1C1] rounded-2xl p-5 space-y-5">
          <p className="text-sm font-semibold text-[#A32D2D]">Danger zone</p>

          {/* Clear activity */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-[#A32D2D]">Clear activity</p>
              <p className="text-xs text-[#A32D2D]/80 mt-1 leading-relaxed">
                Deletes all transactions, income entries, budget allocations and pending conflicts, and resets every wallet balance to €0. Your wallets, distribution rules, recurring income, templates and plans are kept. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => openDelete('activity')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#A32D2D] bg-white border border-[#A32D2D] rounded-lg hover:bg-[#FCEBEB] transition-colors flex-shrink-0"
            >
              <AlertTriangle size={14} />
              Clear activity
            </button>
          </div>

          <div className="border-t border-[#F7C1C1]" />

          {/* Full reset */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-[#A32D2D]">Full reset</p>
              <p className="text-xs text-[#A32D2D]/80 mt-1 leading-relaxed">
                Everything in “Clear activity”, and also removes your distribution rules, recurring income &amp; rules, income templates, and unallocated templates &amp; plans. Only your wallets (including Unallocated) and settings are kept. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => openDelete('full')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[#A32D2D] border border-[#A32D2D] rounded-lg hover:bg-[#8a2626] transition-colors flex-shrink-0"
            >
              <AlertTriangle size={14} />
              Full reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Warning modal ──────────────────────────────────────────────────────── */}
      {deleteModal === 'warning' && deleteTier && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">{RESET_TIERS[deleteTier].title}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">The following will be permanently deleted:</p>
            <ul className="text-sm text-gray-700 dark:text-gray-200 space-y-1.5 mb-3 ml-1">
              {RESET_TIERS[deleteTier].deleted.map(item => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{RESET_TIERS[deleteTier].kept}</p>
            <p className="text-sm font-medium text-[#A32D2D] mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={closeDeleteModals}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={sendOtp}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-lg bg-[#A32D2D] text-white text-sm font-medium hover:bg-[#8a2626] disabled:opacity-50"
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              We sent a 6-digit confirmation code to{' '}
              <span className="font-medium text-gray-700 dark:text-gray-200">{userEmail}</span>.
              Enter it below to confirm deletion.
            </p>
            {deleteError && <p className="text-[#A32D2D] text-sm mb-3">{deleteError}</p>}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 dark:bg-gray-800 dark:text-gray-100"
            />
            <div className="flex gap-3">
              <button
                onClick={closeDeleteModals}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletion}
                disabled={deleteLoading || otpCode.length < 6}
                className="flex-1 py-2 rounded-lg bg-[#A32D2D] text-white text-sm font-medium hover:bg-[#8a2626] disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Confirm deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log out of all devices confirm ─────────────────────────────────────── */}
      {logoutAllModal && (
        <IncomeConfirmModal
          variant="danger"
          title="Log out of all devices?"
          body={
            <>
              This ends every active session, including this one. You'll be returned to the login screen and will need to sign in again everywhere.
              {logoutAllError && <span className="block mt-2 text-[#A32D2D] font-medium">{logoutAllError}</span>}
            </>
          }
          confirmLabel={logoutAllLoading ? 'Logging out…' : 'Log out everywhere'}
          onConfirm={handleLogoutAll}
          onCancel={() => { setLogoutAllModal(false); setLogoutAllError(null) }}
        />
      )}

      {/* ── Success toast ──────────────────────────────────────────────────────── */}
      {deleteSuccess && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          Your data has been reset
        </div>
      )}
    </div>
  )
}
