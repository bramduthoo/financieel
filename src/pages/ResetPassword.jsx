import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [sessionReady, setSessionReady] = useState(false)
  const [password,     setPassword]     = useState('')
  const [confirm,      setConfirm]      = useState('')
  const [error,        setError]        = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [success,      setSuccess]      = useState(false)

  useEffect(() => {
    // A session may already exist if Supabase processed the hash before mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setSessionReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit() {
    setError(null)
    if (password.length < 8)      { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm)     { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="bg-card border border-card-border p-8 rounded-[14px] shadow-sm w-full max-w-md text-center">
          <CheckCircle size={40} className="mx-auto mb-4 text-positive" />
          <h1 className="text-xl font-medium text-ink mb-2">Password updated</h1>
          <p className="text-ink-muted text-sm mb-6">You can now log in with your new password.</p>
          <Link
            to="/login"
            className="text-ink text-sm font-medium hover:text-ink"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-ink-faint">Checking your reset link…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="bg-card p-8 rounded-[14px] shadow-sm w-full max-w-md">

        <h1 className="text-2xl font-medium text-ink mb-2">Reset password</h1>
        <p className="text-ink-muted mb-6">Enter your new password below.</p>

        {error && (
          <div className="bg-negative-tint text-negative text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-ink text-cream py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Updating…' : 'Set new password'}
          </button>
        </div>

      </div>
    </div>
  )
}
