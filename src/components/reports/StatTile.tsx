import type { ReactNode } from 'react'

import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import type { TrendDirection } from '@/lib/reports'

import styles from './StatTile.module.css'

/** The word shown for each direction; the arrow beside it is decoration. */
const TREND_WORDS: Readonly<Record<TrendDirection, string>> = {
  up: 'Up',
  down: 'Down',
  flat: 'No change',
}

const TREND_GLYPHS: Readonly<Record<TrendDirection, string>> = {
  up: '▲',
  down: '▼',
  flat: '–',
}

export interface StatTileProps {
  label: string
  value: ReactNode
  /** Supporting line under the value: what the number is measured against. */
  note?: ReactNode
  trend?: TrendDirection
  /** Spells the movement out, e.g. `2 h more than last week`. */
  trendNote?: ReactNode
  /** Left neutral by default: a rise is not automatically good news. */
  trendTone?: BadgeTone
  className?: string
}

/**
 * One headline number with its label and context.
 *
 * The tile is a labelled group so a screen reader announces which figure it
 * is reading, and a trend is always stated as a word — the arrow and the badge
 * colour only repeat what the text already says.
 */
export function StatTile({
  label,
  value,
  note,
  trend,
  trendNote,
  trendTone = 'neutral',
  className,
}: StatTileProps) {
  return (
    <div className={cx(styles.tile, className)} role="group" aria-label={label}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>

      {trend ? (
        <p className={styles.trend}>
          <Badge tone={trendTone} icon={TREND_GLYPHS[trend]}>
            {TREND_WORDS[trend]}
          </Badge>
          {trendNote ? <span className={styles.trendNote}>{trendNote}</span> : null}
        </p>
      ) : null}

      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  )
}
