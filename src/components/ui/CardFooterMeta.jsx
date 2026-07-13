// Single 11px muted metadata line pinned to the bottom of a content card
// (DESIGN-SPEC §8, rule 1). `mt-auto` keeps it flush to the card floor so cards
// never end in an empty half.
export default function CardFooterMeta({ children, className = '' }) {
  return (
    <p className={`mt-auto text-[11px] text-ink-muted truncate ${className}`}>
      {children}
    </p>
  )
}
