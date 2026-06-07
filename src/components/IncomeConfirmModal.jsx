import { AlertTriangle } from 'lucide-react'

export default function IncomeConfirmModal({ title, body, onConfirm, onCancel, variant = 'primary', confirmLabel = 'Confirm' }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        {variant === 'danger' ? (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-[#FCEBEB] flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-[#A32D2D]" />
            </div>
            <h2 className="text-lg font-medium text-gray-900">{title}</h2>
          </div>
        ) : (
          <h2 className="text-lg font-medium text-gray-900 mb-2">{title}</h2>
        )}
        <div className="text-gray-600 text-sm mb-6">{body}</div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-stone-300 text-sm text-gray-600 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
              variant === 'danger' ? 'bg-[#A32D2D] hover:bg-[#8a2626]' : 'bg-gray-900 hover:bg-gray-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
