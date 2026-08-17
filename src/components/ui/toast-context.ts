import { createContext, useContext } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onSelect: () => void
}

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
  action?: ToastAction
  /** Milliseconds before auto-dismissal; 0 keeps the toast until dismissed. */
  duration?: number
}

export interface Toast extends Omit<ToastInput, 'tone'> {
  id: string
  tone: ToastTone
}

export interface ToastContextValue {
  notify: (input: ToastInput) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>')
  }
  return context
}
