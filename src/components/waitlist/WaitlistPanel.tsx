import { useId, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/toast-context'
import { MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'
import {
  checkEntry,
  entryFor,
  formatPosition,
  type WaitlistEntry,
  type WaitlistSlot,
} from '@/lib/waitlist'
import { formatClock, formatWeekMinute, overlaps } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'
import { useWaitlist } from '@/state/waitlist-context'

import styles from './WaitlistPanel.module.css'

export type WaitlistPanelProps = WaitlistSlot

/**
 * The queue for one slot: who is waiting, in what order, and a control to take
 * or give up a place. Positions are stated in words as well as shown, because
 * the rank badge alone would carry the meaning in colour and layout only.
 */
export function WaitlistPanel({ machineId, startMinute, endMinute }: WaitlistPanelProps) {
  const slot = useMemo<WaitlistSlot>(
    () => ({ machineId, startMinute, endMinute }),
    [machineId, startMinute, endMinute],
  )

  const { member } = useSession()
  const { bookings } = useBoard()
  const { join, leave, entriesForSlot } = useWaitlist()
  const { notify } = useToast()
  const [note, setNote] = useState('')
  const headingId = useId()
  const noteId = useId()

  const queue = entriesForSlot(slot)
  const machine = MACHINES_BY_ID.get(machineId)
  const mine = entryFor(queue, slot, member.id)
  const holder = bookings.find(
    (booking) => booking.machineId === machineId && overlaps(booking, slot),
  )

  // Waiting only makes sense because somebody else holds the slot, so the
  // preview asks whether the member would qualify once that booking is gone.
  const rejections = useMemo(() => {
    const provisional: WaitlistEntry = {
      id: 'preview',
      ...slot,
      memberId: member.id,
      note: '',
      joinedAt: 0,
    }
    const freed = bookings.filter(
      (booking) => !(booking.machineId === slot.machineId && overlaps(booking, slot)),
    )
    return checkEntry(provisional, { bookings: freed })
  }, [slot, member.id, bookings])

  if (!machine) return null

  const position = mine ? queue.findIndex((entry) => entry.id === mine.id) + 1 : 0

  return (
    <section className={styles.root} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div>
          <h2 id={headingId} className={styles.title}>
            Waitlist for {machine.name}
          </h2>
          <p className={styles.subtitle}>
            {formatWeekMinute(startMinute)} – {formatClock(endMinute)}
            {holder ? ` · held by ${MEMBERS_BY_ID.get(holder.memberId)?.name ?? 'a member'}` : ''}
          </p>
        </div>
        <Badge tone="neutral">{queue.length} waiting</Badge>
      </header>

      {queue.length === 0 ? (
        <p className={styles.empty}>Nobody is waiting for this slot yet.</p>
      ) : (
        <ol className={styles.queue}>
          {queue.map((entry, index) => {
            const waiting = MEMBERS_BY_ID.get(entry.memberId)
            const place = index + 1

            return (
              <li key={entry.id} className={styles.entry}>
                <span className={styles.rank} aria-hidden="true">
                  {place}
                </span>
                <span className={styles.name}>{waiting?.name ?? 'Former member'}</span>
                <span className="visually-hidden">{formatPosition(place, queue.length)}</span>
                {entry.memberId === member.id ? <Badge tone="accent">You</Badge> : null}
                {place === 1 ? (
                  <Badge tone="ok" icon="↑">
                    Next in line
                  </Badge>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}

      {!holder ? (
        <p className={styles.hint}>
          This slot is free right now — book it on the board instead of waiting.
        </p>
      ) : null}

      {rejections.length > 0 ? (
        <p className={styles.warning}>
          <Badge tone="warn" icon="!">
            You would be passed over
          </Badge>
          <span className={styles.warningText}>{rejections[0].message}</span>
        </p>
      ) : null}

      {mine ? null : (
        <div className={styles.field}>
          <label htmlFor={noteId} className={styles.label}>
            Note <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id={noteId}
            className={styles.input}
            type="text"
            value={note}
            maxLength={80}
            placeholder="What are you making?"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      )}

      <div className={styles.actions}>
        {/* One button in one place across both states, so leaving and
            re-joining never drops the member's focus. */}
        <Button
          variant={mine ? 'ghost' : 'primary'}
          onClick={() => {
            if (mine) {
              leave(mine.id)
              notify({ title: 'You left the waitlist', tone: 'info' })
              return
            }

            const result = join({ ...slot, memberId: member.id, note })
            if (!result.ok) {
              notify({ title: 'You are already on this waitlist', tone: 'warning' })
              return
            }

            setNote('')
            // Joining always lands at the back, so the new queue is one longer.
            notify({
              title: 'You joined the waitlist',
              description: formatPosition(queue.length + 1, queue.length + 1),
              tone: 'success',
            })
          }}
        >
          {mine ? 'Leave the waitlist' : 'Join the waitlist'}
        </Button>
      </div>

      <p role="status" aria-live="polite" className={styles.status}>
        {mine
          ? `You are waiting for this slot. ${formatPosition(position, queue.length)}.`
          : 'You are not on this waitlist.'}
      </p>
    </section>
  )
}
