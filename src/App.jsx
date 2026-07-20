import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ThemeContext } from './lib/ThemeContext'
import { PrivacyContext } from './lib/PrivacyContext'
import { setPrivacy as setPrivacyModule } from './lib/format'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Wallets from './pages/Wallets'
import WalletDetail from './pages/WalletDetail'
import Income from './pages/Income'
import IncomeRecurringDetail from './pages/IncomeRecurringDetail'
import Budgeting from './pages/Budgeting'
import Settings from './pages/Settings'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'

export default function App() {
  const [session,           setSession]           = useState(undefined)
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false)
  const [theme,             setTheme]             = useState('light')
  const [privacy,           setPrivacyState]      = useState(false)

  // Privacy mode is session-only (no persistence): flip the module flag (read by
  // formatMoney) and the React state so every amount re-renders masked. Resets to
  // visible on reload by design.
  function setPrivacy(on) {
    setPrivacyModule(on)
    setPrivacyState(on)
  }

  useEffect(() => {
    // Detect email-confirmation redirect (Supabase includes type=signup in the hash)
    if (window.location.hash.includes('type=signup')) {
      setShowWelcomeBanner(true)
      setTimeout(() => setShowWelcomeBanner(false), 5000)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        supabase.from('settings').select('theme').single().then(({ data }) => {
          if (data?.theme) setTheme(data.theme)
        })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        supabase.from('settings').select('theme').single().then(({ data }) => {
          if (data?.theme) setTheme(data.theme)
        })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (session === undefined) {
    return (
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <PrivacyContext.Provider value={{ privacy, setPrivacy }}>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
            <p className="text-gray-400">Loading...</p>
          </div>
        </PrivacyContext.Provider>
      </ThemeContext.Provider>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <PrivacyContext.Provider value={{ privacy, setPrivacy }}>
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
                    <Route path="/budgeting"       element={<Budgeting />}     />
                    <Route path="/settings"        element={<Settings />}     />
                  </Routes>
                </Layout>
              : <Navigate to="/login" replace />
          } />
        </Routes>
      </BrowserRouter>
      </PrivacyContext.Provider>
    </ThemeContext.Provider>
  )
}