'use client'
import { useState, useCallback } from 'react'
import { CheckCircle2, Bell } from 'lucide-react'

export interface ToastItem {
  id: string
  message: string
  variant: 'info' | 'success'
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg font-bold text-sm animate-in slide-in-from-right
            ${t.variant === 'success' ? 'bg-green-600 text-white' : 'bg-[var(--color-bronce)] text-white'}`}
        >
          {t.variant === 'success' ? <CheckCircle2 size={18} /> : <Bell size={18} />}
          {t.message}
        </div>
      ))}
    </div>
  )
}

// Hook para manejar la cola de toasts con auto-dismiss
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const pushToast = useCallback((message: string, variant: 'info' | 'success' = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  return { toasts, pushToast }
}
