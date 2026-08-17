import { Badge } from '@/components/ui/Badge'
import { MAINTENANCE_KIND_LABELS, type ServiceLogEntry } from '@/data/maintenance'
import { MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'
import { formatWeekMinute } from '@/lib/weektime'

import styles from './ServiceLogList.module.css'

export interface ServiceLogListProps {
  /** Newest first; the provider hands the log over already ordered. */
  entries: readonly ServiceLogEntry[]
  /** Accessible name for the list, so several logs can share a page. */
  label?: string
}

/** What happened to the machines, most recent first. */
export function ServiceLogList({ entries, label = 'Completed services' }: ServiceLogListProps) {
  if (entries.length === 0) {
    return (
      <p className={styles.empty}>
        <span className={styles.emptyMark} aria-hidden="true">
          ☐
        </span>
        No services recorded yet. Once a keyholder signs one off it appears here.
      </p>
    )
  }

  return (
    <ol className={styles.list} aria-label={label}>
      {entries.map((entry) => {
        const machine = MACHINES_BY_ID.get(entry.machineId)
        const member = MEMBERS_BY_ID.get(entry.memberId)

        return (
          <li key={entry.id} className={styles.item}>
            <div className={styles.head}>
              <span className={styles.machine}>{machine?.name ?? 'Unknown machine'}</span>
              <Badge tone="neutral">{MAINTENANCE_KIND_LABELS[entry.kind]}</Badge>
              <span className={styles.when}>{formatWeekMinute(entry.minute)}</span>
            </div>

            <p className={styles.notes}>{entry.notes}</p>

            <p className={styles.by}>
              {/* Names are resolved at render, so a member leaving the roster
                  leaves the log readable rather than blank. */}
              Signed off by {member?.name ?? 'a former member'}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
