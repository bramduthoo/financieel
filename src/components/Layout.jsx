import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Wallet, ArrowDownCircle, Settings, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

const navItems = [
  { path: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { path: '/wallets',  label: 'Wallets',   icon: Wallet },
  { path: '/income',   label: 'Income',    icon: ArrowDownCircle },
]

const linkClass = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg mb-0.5 transition-colors ${
    isActive ? 'bg-stone-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-stone-100'
  }`

export default function Layout({ children }) {
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
<<<<<<< HEAD
    <div className="flex h-screen">

      {/* Sidebar */}
      <aside className="w-44 bg-white border-r border-stone-200 flex flex-col px-3 py-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-[#D85A30] flex items-center justify-center">
            <Wallet size={15} className="text-white" />
          </div>
          <span className="text-sm font-medium text-gray-900">Financieel</span>
=======
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">

      {/* Sidebar */}
      <aside className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-bold text-indigo-600">Financieel</h1>
>>>>>>> WOUTER
        </div>

        <nav>
          {navItems.map(item => (
<<<<<<< HEAD
            <NavLink key={item.path} to={item.path} end={item.path === '/'} className={linkClass}>
              <item.icon size={15} />
=======
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
>>>>>>> WOUTER
              {item.label}
            </NavLink>
          ))}

          <div className="h-px bg-stone-200 mx-2 my-3" />

          <NavLink to="/settings" className={linkClass}>
            <Settings size={15} />
            Settings
          </NavLink>
        </nav>
<<<<<<< HEAD

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-600 rounded-lg mb-0.5 hover:bg-stone-100 transition-colors mt-auto"
        >
          <LogOut size={15} />
          Sign out
        </button>
=======
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSignOut}
            className="w-full px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors text-left"
          >
            Sign out
          </button>
        </div>
>>>>>>> WOUTER
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-stone-50">
        <div className="px-7 py-6">
          {children}
        </div>
      </main>

    </div>
  )
}
