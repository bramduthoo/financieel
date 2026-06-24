import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Wallets from './pages/Wallets'
import WalletDetail from './pages/WalletDetail'
import Income from './pages/Income'
import IncomeRecurringDetail from './pages/IncomeRecurringDetail'
import Settings from './pages/Settings'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'

export default function App() {
  const [session,           setSession]           = useState(undefined)
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false)

  useEffect(() => {
    // Detect email-confirmation redirect (Supabase includes type=signup in the hash)
    if (window.location.hash.includes('type=signup')) {
      setShowWelcomeBanner(true)
      setTimeout(() => setShowWelcomeBanner(false), 5000)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      {session && showWelcomeBanner && (
        <div className="fixed top-0 inset-x-0 z-50 bg-green-500 text-white text-sm text-center py-3 font-medium">
          Welcome! Your account is verified.
        </div>
      )}
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={
          session ? <Navigate to="/" replace /> : <Login />
        } />
        <Route path="/*" element={
          session
            ? <Layout>
                <Routes>
                  <Route path="/"                element={<Dashboard />}    />
                  <Route path="/wallets"         element={<Wallets />}      />
                  <Route path="/wallets/:id"     element={<WalletDetail />} />
                  <Route path="/income"          element={<Income />}       />
                  <Route path="/income/recurring/:id" element={<IncomeRecurringDetail />} />
                  <Route path="/settings"        element={<Settings />}     />
                </Routes>
              </Layout>
            : <Navigate to="/login" replace />
        } />
      </Routes>
    </BrowserRouter>
  )
}