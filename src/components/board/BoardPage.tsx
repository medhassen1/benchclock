import { useCallback, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { DAY_NAMES, MACHINES, MACHINES_BY_ID, OPENING_HOURS } from '@/data/workshop'
import { cx } from '@/lib/cx'
import { formatClock, formatWeekMinute } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'
import type { Booking, BookingDraft, Rejection } from '@/types'

import { BookingDialog } from './BookingDialog'
import { WeekGrid } from './WeekGrid'
import styles from './BoardPage.module.css'

interface SlotTarget {
  machineId: string
  startMinute: number
}

export function BoardPage() {
  const { member } = useSession()
  const { bookings, pendingIds, createBooking, cancelBooking } = useBoard()

  const [day, setDay] = useState(0)
  const [hideUnavailable, setHideUnavailable] = useState(false)
  const [target, setTarget] = useState<SlotTarget | null>(null)
  const [inspected, setInspected] = useState<Booking | null>(null)
  const [saving, setSaving] = useState(false)
  const [rejections, setRejections] = useState<readonly Rejection[]>([])
  const [announcement, setAnnouncement] = useState('')

  const machines = useMemo(
    () =>
      hideUnavailable
        ? MACHINES.filter(
            (machine) =>
              !machine.outOfService &&
              (!machine.requiredTicket || member.tickets.includes(machine.requiredTicket)),
          )
        : MACHINES,
    [hideUnavailable, member.tickets],
  )

  const dayBookings = useMemo(
    () => bookings.filter((booking) => Math.floor(booking.startMinute / (24 * 60)) === day),
    [bookings, day],
  )

  const submit = useCallback(
    async (draft: BookingDraft) => {
      setSaving(true)
      setRejections([])

      const result = await createBooking(draft)

      setSaving(false)
      if (result.ok) {
        setTarget(null)
        setAnnouncement(
          `Booked ${MACHINES_BY_ID.get(draft.machineId)?.name} for ${formatWeekMinute(draft.startMinute)}.`,
        )
      } else {
        setRejections(result.rejections ?? [])
      }
    },
    [createBooking],
  )

  const drop = useCallback(
    async (booking: Booking) => {
      setInspected(null)
      const ok = await cancelBooking(booking.id)
      setAnnouncement(
        ok
          ? `Cancelled ${MACHINES_BY_ID.get(booking.machineId)?.name} at ${formatClock(booking.startMinute)}.`
          : 'That booking could not be cancelled.',
      )
    },
    [cancelBooking],
  )

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Booking board</h1>
          <p className={styles.subtitle}>
            Pick a free slot to book it, or an existing one to see who has it.
          </p>
        </div>

        <label className={styles.filter}>
          <input
            type="checkbox"
            checked={hideUnavailable}
            onChange={(event) => setHideUnavailable(event.target.checked)}
          />
          Only machines I can book
        </label>
      </header>

      <nav className={styles.days} aria-label="Day">
        {DAY_NAMES.map((name, index) => {
          const open = OPENING_HOURS.some((window) => window.day === index)
          return (
            <button
              key={name}
              type="button"
              className={cx(styles.day, index === day && styles.dayActive)}
              aria-current={index === day ? 'page' : undefined}
              onClick={() => setDay(index)}
            >
              {name.slice(0, 3)}
              {!open ? <span className={styles.dayClosed}> · shut</span> : null}
            </button>
          )
        })}
      </nav>

      <WeekGrid
        day={day}
        machines={machines}
        bookings={dayBookings}
        hours={OPENING_HOURS}
        member={member}
        pendingIds={pendingIds}
        onSelectSlot={(machineId, startMinute) => {
          setRejections([])
          setTarget({ machineId, startMinute })
        }}
        onSelectBooking={setInspected}
      />

      <p className={styles.legend}>
        <span className={styles.key}>
          <span className={cx(styles.swatch, styles.swatchMine)} aria-hidden="true" /> Yours
        </span>
        <span className={styles.key}>
          <span className={cx(styles.swatch, styles.swatchTaken)} aria-hidden="true" /> Taken
        </span>
        <span className={styles.key}>
          <span className={cx(styles.swatch, styles.swatchFree)} aria-hidden="true" /> Free
        </span>
        <span className={styles.hint}>Arrow keys move around the grid.</span>
      </p>

      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>

      {target ? (
        <BookingDialog
          machineId={target.machineId}
          startMinute={target.startMinute}
          member={member}
          bookings={bookings}
          saving={saving}
          serverRejections={rejections}
          onSubmit={submit}
          onClose={() => setTarget(null)}
        />
      ) : null}

      {inspected ? (
        <Dialog
          open
          onClose={() => setInspected(null)}
          title={MACHINES_BY_ID.get(inspected.machineId)?.name ?? 'Booking'}
          description={`${formatWeekMinute(inspected.startMinute)} – ${formatClock(inspected.endMinute)}`}
          footer={
            <>
              <Button onClick={() => setInspected(null)}>Close</Button>
              {inspected.memberId === member.id ? (
                <Button variant="danger" onClick={() => drop(inspected)}>
                  Cancel booking
                </Button>
              ) : null}
            </>
          }
        >
          <p className={styles.owner}>
            {inspected.memberId === member.id ? (
              <Badge tone="accent">Your booking</Badge>
            ) : (
              <Badge tone="neutral">Booked by another member</Badge>
            )}
          </p>
          {inspected.note ? <p className={styles.note}>{inspected.note}</p> : null}
        </Dialog>
      ) : null}
    </div>
  )
}
