import { AlertTriangle } from 'lucide-react'

export default function IncomeConfirmModal({ title, body, onConfirm, onCancel, variant = 'primary', confirmLabel = 'Confirm' }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-card-border rounded-[14px] shadow-xl w-full max-w-sm p-6">
        {variant === 'danger' ? (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-negative-tint flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-negative" />
            </div>
            <h2 className="text-lg font-medium text-ink">{title}</h2>
          </div>
        ) : (
          <h2 className="text-lg font-medium text-ink mb-2">{title}</h2>
        )}
        <div className="text-ink-muted text-sm mb-6">{body}</div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-[9px] border border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-[9px] text-sm font-medium transition-opacity hover:opacity-90 ${
              variant === 'danger' ? 'bg-negative-bar text-white' : 'bg-ink text-cream'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
