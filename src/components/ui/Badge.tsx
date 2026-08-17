import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

import styles from './Badge.module.css'

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'stop'

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  /** Rendered before the label, so tone is never carried by colour alone. */
  icon?: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
