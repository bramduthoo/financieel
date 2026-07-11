import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const inputClass = 'w-full px-3 py-2 border border-card-border rounded-[8px] text-sm bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30'

export default function Login() {
  const [tab,  setTab]  = useState('login')
  const [view, setView] = useState('form') // 'form' | 'signupSuccess' | 'forgotPassword' | 'forgotSuccess'

  // Login
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  // Signup
  const [signupEmail,    setSignupEmail]    = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm,  setSignupConfirm]  = useState('')
  const [signupError,    setSignupError]    = useState(null)
  const [signupLoading,  setSignupLoading]  = useState(false)

  // Forgot password
  const [resetEmail,   setResetEmail]   = useState('')
  const [resetError,   setResetError]   = useState(null)
  const [resetLoading, setResetLoading] = useState(false)

  function switchTab(t) {
    setTab(t)
    setView('form')
    setError(null)
    setSignupError(null)
    setResetError(null)
  }

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setError('Please verify your email address by clicking the link we sent you.')
      } else {
        setError(error.message)
      }
    }
    setLoading(false)
  }

  async function handleSignup() {
    setSignupError(null)
    if (signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters.')
      return
    }
    if (signupPassword !== signupConfirm) {
      setSignupError('Passwords do not match.')
      return
    }
    setSignupLoading(true)
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setSignupError(error.message)
    } else {
      setView('signupSuccess')
    }
    setSignupLoading(false)
  }

  async function handleResetPassword() {
    setResetError(null)
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + '/reset-password',
    })
    if (error) {
      setResetError(error.message)
    } else {
      setView('forgotSuccess')
    }
    setResetLoading(false)
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="bg-card p-8 rounded-[14px] shadow-sm w-full max-w-md">

        <h1 className="text-2xl font-medium text-ink mb-2">Financieel</h1>

        {/* ── Signup success ───────────────────────────────────── */}
        {view === 'signupSuccess' && (
          <div className="text-center py-4">
            <CheckCircle size={40} className="mx-auto mb-4 text-positive" />
            <h2 className="text-lg font-medium text-ink mb-2">Almost there</h2>
            <p className="text-ink-muted text-sm mb-6">
              If this email isn't already registered, you'll receive a verification link shortly. If you already have an account, please log in instead.
            </p>
            <button
              onClick={() => switchTab('login')}
              className="text-ink  text-sm font-medium hover:text-ink "
            >
              Back to login
            </button>
          </div>
        )}

        {/* ── Forgot password success ──────────────────────────── */}
        {view === 'forgotSuccess' && (
          <div className="text-center py-4">
            <CheckCircle size={40} className="mx-auto mb-4 text-positive" />
            <h2 className="text-lg font-medium text-ink mb-2">Check your email</h2>
            <p className="text-ink-muted text-sm mb-6">
              We've sent you a password reset link.
            </p>
            <button
              onClick={() => switchTab('login')}
              className="text-ink  text-sm font-medium hover:text-ink "
            >
              Back to login
            </button>
          </div>
        )}

        {/* ── Forgot password form ─────────────────────────────── */}
        {view === 'forgotPassword' && (
          <div>
            <p className="text-ink-muted mb-6">Enter your email to receive a reset link.</p>

            {resetError && (
              <div className="bg-negative-tint text-negative dark:text-negative text-sm px-4 py-3 rounded-lg mb-4">
                {resetError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Email</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                />
              </div>
              <button
                onClick={handleResetPassword}
                disabled={resetLoading}
                className="w-full bg-ink text-cream py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {resetLoading ? 'Sending…' : 'Send reset link'}
              </button>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={() => switchTab('login')}
                className="text-sm text-ink  hover:text-ink  font-medium"
              >
                Back to login
              </button>
            </div>
          </div>
        )}

        {/* ── Main form (login / signup tabs) ─────────────────── */}
        {view === 'form' && (
          <>
            <p className="text-ink-muted mb-6">Sign in to your dashboard</p>

            {/* Tabs */}
            <div className="bg-track  rounded-[14px] p-1 flex gap-1 mb-6">
              {[['login', 'Log in'], ['signup', 'Sign up']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => switchTab(id)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === id
                      ? 'bg-card shadow-sm text-ink dark:text-ink font-medium'
                      : 'text-ink-soft hover:text-ink dark:hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Login tab ── */}
            {tab === 'login' && (
              <div>
                {error && (
                  <div className="bg-negative-tint text-negative dark:text-negative text-sm px-4 py-3 rounded-lg mb-4">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                    />
                  </div>
                  <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full bg-ink text-cream py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Signing in…' : 'Sign in'}
                  </button>
                </div>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setView('forgotPassword')}
                    className="text-sm text-ink-faint hover:text-ink-soft dark:hover:text-ink-faint"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
            )}

            {/* ── Signup tab ── */}
            {tab === 'signup' && (
              <div>
                {signupError && (
                  <div className="bg-negative-tint text-negative dark:text-negative text-sm px-4 py-3 rounded-lg mb-4">
                    {signupError}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Email</label>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={e => setSignupEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Password</label>
                    <input
                      type="password"
                      value={signupPassword}
                      onChange={e => setSignupPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Confirm password</label>
                    <input
                      type="password"
                      value={signupConfirm}
                      onChange={e => setSignupConfirm(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSignup()}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 bg-field text-ink"
                    />
                  </div>
                  <button
                    onClick={handleSignup}
                    disabled={signupLoading}
                    className="w-full bg-ink text-cream py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                    {signupLoading ? 'Creating account…' : 'Create account'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
