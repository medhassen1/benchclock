import { useMemo, useState } from 'react'

import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  filterAuditEntries,
  formatAuditEntry,
  formatAuditTime,
  groupAuditEntriesByDay,
  isAuditAction,
  type AuditAction,
} from '@/lib/audit'
import { useAudit } from '@/state/audit-context'

import styles from './AuditLogPage.module.css'

/** A tone per action, so cancellations stand out from routine bookings. */
const ACTION_TONES: Readonly<Record<AuditAction, BadgeTone>> = {
  'booking-created': 'ok',
  'booking-moved': 'accent',
  'booking-cancelled': 'stop',
  'bookings-imported': 'accent',
  'bookings-exported': 'neutral',
  'member-switched': 'neutral',
}

export function AuditLogPage() {
  const { entries, clear } = useAudit()
  const [action, setAction] = useState<AuditAction | 'all'>('all')
  const [confirmingClear, setConfirmingClear] = useState(false)

  const shown = useMemo(
    () => filterAuditEntries(entries, action === 'all' ? {} : { action }),
    [entries, action],
  )
  const groups = useMemo(() => groupAuditEntriesByDay(shown), [shown])

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Audit log</h1>
          <p className={styles.subtitle}>
            Everything the board has been asked to do, newest first.
          </p>
        </div>

        <div className={styles.controls}>
          <label className={styles.filterLabel} htmlFor="audit-action">
            Action
          </label>
          <select
            id="audit-action"
            className={styles.select}
            value={action}
            onChange={(event) => {
              const next = event.target.value
              setAction(isAuditAction(next) ? next : 'all')
            }}
          >
            <option value="all">All actions</option>
            {AUDIT_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {AUDIT_ACTION_LABELS[value]}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            disabled={entries.length === 0}
            onClick={() => setConfirmingClear(true)}
          >
            Clear log
          </Button>
        </div>
      </header>

      <p className={styles.count} role="status" aria-live="polite">
        {shown.length === entries.length
          ? `${entries.length} events logged.`
          : `${shown.length} of ${entries.length} events shown.`}
      </p>

      {groups.length === 0 ? (
        <p className={styles.empty}>
          {entries.length === 0
            ? 'Nothing has been logged yet. Book, move, or cancel something and it shows up here.'
            : 'No events match that filter.'}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className={styles.day} aria-labelledby={`day-${group.key}`}>
            <h2 id={`day-${group.key}`} className={styles.dayHeading}>
              {group.label}
            </h2>

            <table className={styles.table}>
              <caption className="visually-hidden">Events on {group.label}</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Event</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {group.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className={styles.time}>{formatAuditTime(entry.at)}</td>
                    <td className={styles.sentence}>{formatAuditEntry(entry)}</td>
                    <td>
                      <Badge tone={ACTION_TONES[entry.action]}>
                        {AUDIT_ACTION_LABELS[entry.action]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      <Dialog
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title="Clear the audit log?"
        description={`${entries.length} events will be removed.`}
        footer={
          <>
            <Button onClick={() => setConfirmingClear(false)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingClear(false)
                clear()
              }}
            >
              Clear log
            </Button>
          </>
        }
      >
        <p>The trail is append-only, so clearing it cannot be undone.</p>
      </Dialog>
    </div>
  )
}
