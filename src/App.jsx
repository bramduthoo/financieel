import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Wallets from './pages/Wallets'
import WalletDetail from './pages/WalletDetail'
import Income from './pages/Income'
import IncomeRecurringDetail from './pages/IncomeRecurringDetail'
import Login from './pages/Login'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
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
      <Routes>
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
                </Routes>
              </Layout>
            : <Navigate to="/login" replace />
        } />
      </Routes>
    </BrowserRouter>
  )
}