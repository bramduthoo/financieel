import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Wallet, ArrowDownCircle, Settings, LogOut, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePrivacy } from '../lib/PrivacyContext'

const navItems = [
  { path: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { path: '/wallets',  label: 'Wallets',   icon: Wallet },
  { path: '/income',   label: 'Income',    icon: ArrowDownCircle },
]

// Active item inverts via tokens: bg-ink + text-cream both flip per theme
// (dark ink = #F1EFE8, dark cream = #14140F), giving the spec's inverted pill.
const linkClass = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-[9px] mb-0.5 transition-colors ${
    isActive
      ? 'bg-ink text-cream font-medium'
      : 'text-ink-muted hover:bg-track'
  }`

export default function Layout({ children }) {
  const navigate = useNavigate()
  const { privacy, setPrivacy } = usePrivacy()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-cream">

      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-card border-r border-card-border flex flex-col">
        <div className="p-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[9px] bg-accent-solid flex items-center justify-center">
              <Wallet size={16} className="text-white" />
            </div>
            <h1 className="text-[15px] font-medium text-ink tracking-tight">Financieel</h1>
          </div>
        </div>

        <nav className="flex-1 px-3">
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={linkClass}
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            )
          })}

          <div className="h-px bg-card-border mx-1 my-3" />

          <NavLink to="/settings" className={linkClass}>
            <Settings size={16} />
            Settings
          </NavLink>
        </nav>

        <div className="p-3">
          <button
            onClick={() => setPrivacy(!privacy)}
            aria-pressed={privacy}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-[9px] text-ink-muted hover:bg-track transition-colors text-left"
          >
            {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
            {privacy ? 'Show amounts' : 'Hide amounts'}
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-[9px] text-ink-muted hover:text-negative hover:bg-negative-tint transition-colors text-left"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content — min-w-0 lets main shrink to the viewport so wide page
          content is contained inside it (scrolls within main) instead of
          pushing the whole shell wider and shoving the scrollbar off-screen. */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-cream">
        <div className="px-7 py-6">
          {children}
        </div>
      </main>

    </div>
  )
}
