import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ThemeContext } from './lib/ThemeContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Wallets from './pages/Wallets'
import WalletDetail from './pages/WalletDetail'
import Income from './pages/Income'
import IncomeRecurringDetail from './pages/IncomeRecurringDetail'
import Settings from './pages/Settings'
import Login from './pages/Login'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [theme,   setTheme]   = useState('light')

  useEffect(() => {
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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      </ThemeContext.Provider>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
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
                    <Route path="/settings"        element={<Settings />}     />
                  </Routes>
                </Layout>
              : <Navigate to="/login" replace />
          } />
        </Routes>
      </BrowserRouter>
    </ThemeContext.Provider>
  )
}