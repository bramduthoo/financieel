// Spec progress bar (DESIGN-SPEC §4 / §8): 5–6px tall, rounded-full, track `bg-track`,
// fill defaults to the positive green bar stop. `value`/`max` are clamped to 0–100%.
export default function MetricBar({ value, max, fillClass = 'bg-positive-bar', className = '' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`h-1.5 w-full rounded-full bg-track ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${fillClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
