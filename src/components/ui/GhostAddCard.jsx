import { Plus } from 'lucide-react'

// Dashed "add" placeholder that fills a grid remainder instead of empty space
// (DESIGN-SPEC §8, rule 6). Opens the existing create flow via `onClick`.
export default function GhostAddCard({ label = 'Add', onClick, icon, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[14px] border border-dashed border-card-border flex flex-col items-center justify-center gap-2 p-4 min-h-[140px] text-ink-faint hover:text-ink-muted hover:border-ink-faint transition-colors ${className}`}
    >
      {icon ?? <Plus size={20} />}
      <span className="text-sm">{label}</span>
    </button>
  )
}
