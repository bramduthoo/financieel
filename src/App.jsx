import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ThemeContext } from './lib/ThemeContext'
import { CurrencyContext } from './lib/CurrencyContext'
import { setActiveCurrency } from './lib/format'
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
  const [theme,             setTheme]             = useState('light')
  const [currency,          setCurrencyState]     = useState('EUR')

  // Keep the module-level active currency (read by formatMoney) in sync with the
  // React state so a switch both updates the symbol and re-renders the tree.
  function setCurrency(code) {
    setActiveCurrency(code)
    setCurrencyState(code)
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
        supabase.from('settings').select('theme, currency').single().then(({ data }) => {
          if (data?.theme) setTheme(data.theme)
          if (data?.currency) setCurrency(data.currency)
        })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        supabase.from('settings').select('theme, currency').single().then(({ data }) => {
          if (data?.theme) setTheme(data.theme)
          if (data?.currency) setCurrency(data.currency)
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
        <CurrencyContext.Provider value={{ currency, setCurrency }}>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
            <p className="text-gray-400">Loading...</p>
          </div>
        </CurrencyContext.Provider>
      </ThemeContext.Provider>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <CurrencyContext.Provider value={{ currency, setCurrency }}>
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
      </CurrencyContext.Provider>
    </ThemeContext.Provider>
  )
}