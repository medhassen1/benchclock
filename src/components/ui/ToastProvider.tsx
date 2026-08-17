import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

import { ToastContext, type Toast, type ToastInput, type ToastTone } from './toast-context'
import styles from './ToastProvider.module.css'

const DEFAULT_DURATION = 4_000

/** A shape per tone, so meaning never rests on colour alone. */
const TONE_MARK: Record<ToastTone, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '✕',
}

const TONE_LABEL: Record<ToastTone, string> = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const nextId = useRef(0)

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (input: ToastInput) => {
      nextId.current += 1
      const id = `toast-${nextId.current}`
      const duration = input.duration ?? DEFAULT_DURATION

      setToasts((current) => [...current, { ...input, id, tone: input.tone ?? 'info' }])

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }

      return id
    },
    [dismiss],
  )

  // Clear pending timers so a late dismissal never fires after unmount.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className={styles.region} role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(styles.toast, styles[toast.tone])}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          >
            <span className={styles.mark} aria-hidden="true">
              {TONE_MARK[toast.tone]}
            </span>

            <div className={styles.content}>
              <p className={styles.title}>
                <span className="visually-hidden">{TONE_LABEL[toast.tone]}: </span>
                {toast.title}
              </p>
              {toast.description ? <p className={styles.description}>{toast.description}</p> : null}
            </div>

            {toast.action ? (
              <button type="button" className={styles.action} onClick={toast.action.onSelect}>
                {toast.action.label}
              </button>
            ) : null}

            <button type="button" className={styles.dismiss} onClick={() => dismiss(toast.id)}>
              <span aria-hidden="true">×</span>
              <span className="visually-hidden">Dismiss {toast.title}</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
