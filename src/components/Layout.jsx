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
    <div className="flex h-screen">

      {/* Sidebar */}
      <aside className="w-44 bg-white border-r border-stone-200 flex flex-col px-3 py-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-[#D85A30] flex items-center justify-center">
            <Wallet size={15} className="text-white" />
          </div>
          <span className="text-sm font-medium text-gray-900">Financieel</span>
        </div>

        <nav>
          {navItems.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'} className={linkClass}>
              <item.icon size={15} />
              {item.label}
            </NavLink>
          ))}

          <div className="h-px bg-stone-200 mx-2 my-3" />

          <NavLink to="/settings" className={linkClass}>
            <Settings size={15} />
            Settings
          </NavLink>
        </nav>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-600 rounded-lg mb-0.5 hover:bg-stone-100 transition-colors mt-auto"
        >
          <LogOut size={15} />
          Sign out
        </button>
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
