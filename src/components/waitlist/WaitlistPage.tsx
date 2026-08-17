import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast-context'
import { MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'
import { formatPosition, queueLength, type WaitlistEntry } from '@/lib/waitlist'
import {
  durationOf,
  formatClock,
  formatDuration,
  formatWeekMinute,
  overlaps,
} from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'
import { useWaitlist } from '@/state/waitlist-context'

import styles from './WaitlistPage.module.css'

/**
 * Every slot the signed-in member is queueing for. Position is spelled out —
 * "Position 2 of 4" — rather than left to a rank badge, so the queue reads the
 * same to a screen reader as it does on screen.
 */
export function WaitlistPage() {
  const { member } = useSession()
  const { entries, entriesForMember, positionOf, leave } = useWaitlist()
  const { bookings } = useBoard()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState<WaitlistEntry | null>(null)

  const mine = useMemo(() => entriesForMember(member.id), [entriesForMember, member.id])

  const rows = useMemo(
    () =>
      mine.map((entry) => ({
        entry,
        machine: MACHINES_BY_ID.get(entry.machineId),
        position: positionOf(entry.id),
        total: queueLength(entries, entry),
        holder: bookings.find(
          (booking) => booking.machineId === entry.machineId && overlaps(booking, entry),
        ),
      })),
    [mine, entries, positionOf, bookings],
  )

  if (mine.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyMark} aria-hidden="true">
          ⏳
        </span>
        <h1 className={styles.title}>You are not waiting for anything</h1>
        <p className={styles.subtitle}>
          When a slot you want is already taken, join its waitlist and it will show up here.
        </p>
        <Link className={styles.cta} to="/">
          Go to the board
        </Link>
      </div>
    )
  }

  const next = rows.filter((row) => row.position === 1).length

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Waiting for</h1>
          <p className={styles.subtitle}>
            {mine.length} {mine.length === 1 ? 'slot' : 'slots'}, {next} of them next in line.
          </p>
        </div>
      </header>

      <table className={styles.table}>
        <caption className="visually-hidden">Slots you are waiting for</caption>
        <thead>
          <tr>
            <th scope="col">Machine</th>
            <th scope="col">When</th>
            <th scope="col">Length</th>
            <th scope="col">Your place</th>
            <th scope="col">Held by</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, machine, position, total, holder }) => (
            <tr key={entry.id}>
              <th scope="row" className={styles.machineCell}>
                <span className={styles.code} aria-hidden="true">
                  {machine?.code}
                </span>
                {machine?.name ?? 'Unknown machine'}
              </th>
              <td className={styles.when}>
                {formatWeekMinute(entry.startMinute)} – {formatClock(entry.endMinute)}
              </td>
              <td className={styles.numeric}>{formatDuration(durationOf(entry))}</td>
              <td className={styles.place}>
                {formatPosition(position, total)}
                {position === 1 ? (
                  <Badge tone="ok" icon="↑">
                    Next in line
                  </Badge>
                ) : null}
              </td>
              <td className={styles.muted}>
                {holder ? (
                  (MEMBERS_BY_ID.get(holder.memberId)?.name ?? 'A former member')
                ) : (
                  <Badge tone="accent" icon="✓">
                    Free now
                  </Badge>
                )}
              </td>
              <td className={styles.actions}>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(entry)}>
                  Leave
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Give up your place?"
        description={
          confirming
            ? `${MACHINES_BY_ID.get(confirming.machineId)?.name} · ${formatWeekMinute(confirming.startMinute)}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Stay in the queue</Button>
            <Button
              variant="danger"
              onClick={() => {
                const entry = confirming
                setConfirming(null)
                if (!entry) return

                notify(
                  leave(entry.id)
                    ? { title: 'You left the waitlist', tone: 'info' }
                    : { title: 'That place had already gone', tone: 'error' },
                )
              }}
            >
              Leave the waitlist
            </Button>
          </>
        }
      >
        <p>
          Everyone behind you moves up a place. You can join again later, but you will start at
          the back of the queue.
        </p>
      </Dialog>
    </div>
  )
}
