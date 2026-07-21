// The one page header, used by every app-shell page (DESIGN-SPEC §4).
// Title 26px `font-medium tracking-tight`, optional eyebrow / icon / meta / actions,
// closed by a hairline. Login and ResetPassword are deliberately excluded — they are
// centred auth cards outside the shell, so their <h1> is a card heading, not a page header.
//
// `meta` is for SHORT FACTUAL data only (a month label, a wallet's type + budget, a
// recurrence). Explanatory or instructional prose in a page header is a design violation
// (budgeting-page-plan.md §12.6) — labels, numbers and empty states carry the meaning.

import { Link } from 'react-router-dom'

const EYEBROW = 'text-[11px] uppercase tracking-wider text-ink-muted'

export default function PageHeader({
  eyebrow,
  eyebrowTo,
  icon,
  title,
  meta,
  actions,
  className = '',
}) {
  return (
    <div className={`flex items-center justify-between gap-4 pb-4 mb-6 border-b border-card-border ${className}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon}
        <div className="min-w-0">
          {eyebrow && (
            eyebrowTo
              ? (
                <Link
                  to={eyebrowTo}
                  className={`${EYEBROW} inline-block py-0.5 -my-0.5 hover:text-ink transition-colors rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30`}
                >
                  {eyebrow}
                </Link>
              )
              : <p className={EYEBROW}>{eyebrow}</p>
          )}
          <h1 className="text-[26px] font-medium tracking-tight text-ink truncate">{title}</h1>
          {meta && <p className="text-[13px] text-ink-muted mt-0.5 truncate">{meta}</p>}
        </div>
      </div>

      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  )
}
