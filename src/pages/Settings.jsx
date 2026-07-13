import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, LogOut } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import IncomeConfirmModal from '../components/IncomeConfirmModal'

const authInputClass =
  'w-full px-3 py-2 bg-field border border-card-border rounded-[8px] text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30'

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

// On/off switch. Active = coral (accent-solid), off = ink-faint — both fixed
// across themes so the white knob stays visible in light and dark. No purple.
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
        checked ? 'bg-accent-solid' : 'bg-ink-faint'
      }`}
    >
      <div
        className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function SettingCard({ label, description, children }) {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{label}</p>
          {description && (
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">{description}</p>
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

  if (loading) return <p className="text-ink-muted">Loading settings...</p>
  if (!settings) return <p className="text-ink-muted">No settings found.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink">Settings</h1>
          <p className="text-ink-soft text-sm mt-1">App preferences and configuration</p>
        </div>
        <span
          className={`text-sm font-medium text-positive transition-opacity duration-500 ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Saved
        </span>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Profile (Task D) */}
        <div className="bg-card border border-card-border rounded-[14px] p-6">
          <p className="text-sm font-medium text-ink">Profile</p>
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">Your account details.</p>
          <dl className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-6">
              <dt className="text-sm text-ink-muted">Email</dt>
              <dd className="text-sm font-medium text-ink truncate">{userEmail ?? '—'}</dd>
            </div>
            {memberSince && (
              <div className="flex items-center justify-between gap-6">
                <dt className="text-sm text-ink-muted">Member since</dt>
                <dd className="text-sm font-medium text-ink">{format(new Date(memberSince), 'd MMM yyyy')}</dd>
              </div>
            )}
          </dl>
        </div>

        <SettingCard
          label="Currency"
          description="The currency used throughout the app."
        >
          <span className="text-sm font-medium text-ink-soft bg-field px-3 py-1.5 rounded-[8px]">
            EUR €
          </span>
        </SettingCard>

        <SettingCard
          label="Theme"
          description="Switch between light and dark mode."
        >
          <div className="flex items-center gap-3">
            <span className={`text-sm ${settings.theme === 'light' ? 'text-ink font-medium' : 'text-ink-muted'}`}>
              Light
            </span>
            <Toggle
              checked={settings.theme === 'dark'}
              onChange={isDark => updateSetting('theme', isDark ? 'dark' : 'light')}
            />
            <span className={`text-sm ${settings.theme === 'dark' ? 'text-ink font-medium' : 'text-ink-muted'}`}>
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
            <span className={`text-sm ${!settings.strict_distribution ? 'text-ink font-medium' : 'text-ink-muted'}`}>
              OFF
            </span>
            <Toggle
              checked={settings.strict_distribution ?? true}
              onChange={val => updateSetting('strict_distribution', val)}
            />
            <span className={`text-sm ${settings.strict_distribution ? 'text-ink font-medium' : 'text-ink-muted'}`}>
              ON
            </span>
          </div>
        </SettingCard>

        {/* Password change (Task C) */}
        <div className="bg-card border border-card-border rounded-[14px] p-6">
          <p className="text-sm font-medium text-ink">Change password</p>
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            Enter your current password, then choose a new one (at least 8 characters).
          </p>

          {pwError && (
            <div className="bg-negative-tint text-negative text-sm px-4 py-3 rounded-[8px] mt-4">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="bg-positive-tint text-positive text-sm px-4 py-3 rounded-[8px] mt-4">
              Password updated successfully.
            </div>
          )}

          <div className="space-y-3 mt-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">Current password</label>
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
              <label className="block text-sm font-medium text-ink-soft mb-1">New password</label>
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
              <label className="block text-sm font-medium text-ink-soft mb-1">Confirm new password</label>
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
              className="px-4 py-2 rounded-[9px] bg-ink text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {pwLoading ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </div>

        {/* Log out of all devices (Task F) */}
        <div className="bg-card border border-card-border rounded-[14px] p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">Log out of all devices</p>
              <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                Ends every active session, including this one. You'll need to sign in again everywhere.
              </p>
            </div>
            <button
              onClick={() => { setLogoutAllError(null); setLogoutAllModal(true) }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink-soft bg-transparent border border-[#D3D1C7] dark:border-card-border rounded-[9px] hover:bg-track transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
              Log out everywhere
            </button>
          </div>
        </div>

        {/* Danger zone (Task B — two tiers) */}
        <div className="bg-negative-tint border border-negative-bar/25 rounded-[14px] p-5 space-y-5">
          <p className="text-sm font-medium text-negative">Danger zone</p>

          {/* Clear activity */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-negative">Clear activity</p>
              <p className="text-xs text-negative/80 mt-1 leading-relaxed">
                Deletes all transactions, income entries, budget allocations and pending conflicts, and resets every wallet balance to €0. Your wallets, distribution rules, recurring income, templates and plans are kept. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => openDelete('activity')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-negative bg-card border border-negative-bar/50 rounded-[9px] hover:bg-negative-tint transition-colors flex-shrink-0"
            >
              <AlertTriangle size={14} />
              Clear activity
            </button>
          </div>

          <div className="border-t border-negative-bar/20" />

          {/* Full reset */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-negative">Full reset</p>
              <p className="text-xs text-negative/80 mt-1 leading-relaxed">
                Everything in “Clear activity”, and also removes your distribution rules, recurring income &amp; rules, income templates, and unallocated templates &amp; plans. Only your wallets (including Unallocated) and settings are kept. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => openDelete('full')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-negative-bar border border-negative-bar rounded-[9px] hover:opacity-90 transition-opacity flex-shrink-0"
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
          <div className="bg-card border border-card-border rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-ink mb-3">{RESET_TIERS[deleteTier].title}</h2>
            <p className="text-sm text-ink-soft mb-3">The following will be permanently deleted:</p>
            <ul className="text-sm text-ink space-y-1.5 mb-3 ml-1">
              {RESET_TIERS[deleteTier].deleted.map(item => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
            <p className="text-sm text-ink-soft mb-3">{RESET_TIERS[deleteTier].kept}</p>
            <p className="text-sm font-medium text-negative mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={closeDeleteModals}
                className="flex-1 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendOtp}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-[9px] bg-negative-bar text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
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
          <div className="bg-card border border-card-border rounded-[14px] shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-ink mb-2">Check your email</h2>
            <p className="text-sm text-ink-muted mb-4">
              We sent a 6-digit confirmation code to{' '}
              <span className="font-medium text-ink">{userEmail}</span>.
              Enter it below to confirm deletion.
            </p>
            {deleteError && <p className="text-negative text-sm mb-3">{deleteError}</p>}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-3 py-2 bg-field border border-card-border rounded-[8px] text-sm text-ink text-center tracking-widest placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-negative-bar/40 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={closeDeleteModals}
                className="flex-1 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletion}
                disabled={deleteLoading || otpCode.length < 6}
                className="flex-1 py-2 rounded-[9px] bg-negative-bar text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
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
              {logoutAllError && <span className="block mt-2 text-negative font-medium">{logoutAllError}</span>}
            </>
          }
          confirmLabel={logoutAllLoading ? 'Logging out…' : 'Log out everywhere'}
          onConfirm={handleLogoutAll}
          onCancel={() => { setLogoutAllModal(false); setLogoutAllError(null) }}
        />
      )}

      {/* ── Success toast ──────────────────────────────────────────────────────── */}
      {deleteSuccess && (
        <div className="fixed bottom-6 right-6 bg-ink text-cream px-4 py-3 rounded-[14px] shadow-lg text-sm font-medium z-50">
          Your data has been reset
        </div>
      )}
    </div>
  )
}
