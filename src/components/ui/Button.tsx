import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and blocks activation without collapsing the label. */
  loading?: boolean
  iconStart?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconStart,
    className,
    children,
    disabled,
    onClick,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
      // Stays focusable while busy so focus is never lost mid-action.
      disabled={disabled}
      aria-disabled={disabled || loading || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : iconStart}
      <span>{children}</span>
    </button>
  )
})
