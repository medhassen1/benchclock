import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast-context'
import { MACHINES_BY_ID } from '@/data/workshop'
import { durationOf, formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'
import type { Booking } from '@/types'

import styles from './MyBookingsPage.module.css'

export function MyBookingsPage() {
  const { member } = useSession()
  const { bookingsForMember, cancelBooking, pendingIds } = useBoard()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState<Booking | null>(null)

  const mine = useMemo(() => bookingsForMember(member.id), [bookingsForMember, member.id])
  const totalMinutes = useMemo(
    () => mine.reduce((sum, booking) => sum + durationOf(booking), 0),
    [mine],
  )

  if (mine.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyMark} aria-hidden="true">
          ☰
        </span>
        <h1 className={styles.title}>No bookings yet</h1>
        <p className={styles.subtitle}>
          Pick a free slot on the board and it will show up here.
        </p>
        <Link className={styles.cta} to="/">
          Go to the board
        </Link>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>My bookings</h1>
          <p className={styles.subtitle}>
            {mine.length} booked, {formatDuration(totalMinutes)} of machine time this week.
          </p>
        </div>
      </header>

      <table className={styles.table}>
        <caption className="visually-hidden">Your bookings this week</caption>
        <thead>
          <tr>
            <th scope="col">Machine</th>
            <th scope="col">When</th>
            <th scope="col">Length</th>
            <th scope="col">Note</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {mine.map((booking) => {
            const machine = MACHINES_BY_ID.get(booking.machineId)
            const pending = pendingIds.has(booking.id)

            return (
              <tr key={booking.id} className={pending ? styles.pending : undefined}>
                <th scope="row" className={styles.machineCell}>
                  <span className={styles.code} aria-hidden="true">
                    {machine?.code}
                  </span>
                  {machine?.name ?? 'Unknown machine'}
                </th>
                <td className={styles.when}>
                  {formatWeekMinute(booking.startMinute)} – {formatClock(booking.endMinute)}
                </td>
                <td className={styles.numeric}>{formatDuration(durationOf(booking))}</td>
                <td className={styles.note}>
                  {booking.note || <span className={styles.faint}>—</span>}
                </td>
                <td className={styles.actions}>
                  {pending ? (
                    <Badge tone="neutral">Saving…</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(booking)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Cancel this booking?"
        description={
          confirming
            ? `${MACHINES_BY_ID.get(confirming.machineId)?.name} · ${formatWeekMinute(confirming.startMinute)}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const booking = confirming
                setConfirming(null)
                if (!booking) return

                const ok = await cancelBooking(booking.id)
                notify(
                  ok
                    ? { title: 'Booking cancelled', tone: 'info' }
                    : { title: 'That booking could not be cancelled', tone: 'error' },
                )
              }}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <p>The slot goes back on the board for anyone to take.</p>
      </Dialog>
    </div>
  )
}
