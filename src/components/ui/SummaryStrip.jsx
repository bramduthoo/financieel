// Segmented summary stat bar under a page header (DESIGN-SPEC §8, rule 2).
// One card, 3–4 cells split by 1px `inner-border` gaps; each cell = 11px uppercase
// label above an 18px value. Stats are computed from the page's own data by the caller.

const TONE = {
  ink:      'text-ink',
  coral:    'text-accent',
  positive: 'text-positive',
  negative: 'text-negative',
}

export function StatCell({ label, value, tone = 'ink' }) {
  return (
    <div className="flex-1 min-w-0 px-5 py-3.5 first:pl-6 last:pr-6">
      <p className="text-[11px] uppercase tracking-wider text-ink-muted truncate">{label}</p>
      <p className={`mt-1 text-lg font-medium tracking-tight truncate ${TONE[tone] ?? TONE.ink}`}>
        {value}
      </p>
    </div>
  )
}

// `stats`: array of { label, value, tone? }.
export default function SummaryStrip({ stats, className = '' }) {
  return (
    <div className={`bg-card border border-card-border rounded-[14px] flex divide-x divide-inner-border overflow-hidden ${className}`}>
      {stats.map((s, i) => (
        <StatCell key={s.label ?? i} label={s.label} value={s.value} tone={s.tone} />
      ))}
    </div>
  )
}
