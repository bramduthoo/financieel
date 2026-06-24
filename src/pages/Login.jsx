import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'

const inputClass = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
<<<<<<< HEAD
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-8 w-full max-w-md">

        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-[#D85A30] flex items-center justify-center">
            <Wallet size={15} className="text-white" />
          </div>
          <h1 className="text-xl font-medium text-gray-900">Financieel</h1>
        </div>
        <p className="text-sm text-gray-600 mb-8">Sign in to your dashboard</p>
=======
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm w-full max-w-md">

        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Financieel</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Sign in to your dashboard</p>
>>>>>>> WOUTER

        {error && (
          <div className="bg-[#FCEBEB] text-[#A32D2D] text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com"
<<<<<<< HEAD
              className={inputClass}
=======
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
>>>>>>> WOUTER
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
<<<<<<< HEAD
              className={inputClass}
=======
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
>>>>>>> WOUTER
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>

      </div>
    </div>
  )
}
