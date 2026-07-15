// Compact list row (DESIGN-SPEC §8, rule 4): 28px icon chip + name + 11px muted meta
// line + right-aligned value, with an optional trailing slot (pill / hover actions).
// Render several inside one card wrapped in `divide-y divide-inner-border` so rows are
// separated by hairlines — never as individual large cards.
//
// `icon` is a node (e.g. <WalletIcon …/> or a lucide icon). `value` is the right-aligned
// primary figure; `trailing` is optional extra content after it (a pill, action buttons).
export default function CompactRow({
  icon, chipClass = 'bg-accent/10 text-accent',
  name, meta, value, trailing, onClick, className = '',
}) {
  // A div (not a <button>) so callers can nest interactive controls (Log-now pill,
  // edit/delete) in `trailing` without invalid button-in-button markup.
  return (
    <div
      onClick={onClick}
      className={`group w-full flex items-center gap-3 py-3 text-left ${
        onClick ? 'hover:bg-track transition-colors cursor-pointer' : ''
      } ${className}`}
    >
      <div className={`w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0 ${chipClass}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{name}</p>
        {meta && <p className="text-[11px] text-ink-muted truncate">{meta}</p>}
      </div>
      {value != null && (
        <span className="text-sm font-medium text-ink tracking-tight whitespace-nowrap">{value}</span>
      )}
      {trailing}
    </div>
  )
}
