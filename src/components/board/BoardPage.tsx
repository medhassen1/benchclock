import { useCallback, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast-context'
import { DAY_NAMES, MACHINES, MACHINES_BY_ID, OPENING_HOURS } from '@/data/workshop'
import { cx } from '@/lib/cx'
import { SLOT_MINUTES } from '@/data/workshop'
import { durationOf, formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import { MEMBERS_BY_ID } from '@/data/workshop'
import { useBoard } from '@/state/board-context'
import { useWaitlist } from '@/state/waitlist-context'
import { useSession } from '@/state/session-context'
import type { Booking, BookingDraft, Machine, Rejection } from '@/types'

import { BookingDialog } from './BookingDialog'
import { MachineDialog } from './MachineDialog'
import { WeekGrid } from './WeekGrid'
import styles from './BoardPage.module.css'

interface SlotTarget {
  machineId: string
  startMinute: number
}

export function BoardPage() {
  const { member } = useSession()
  const { bookings, pendingIds, createBooking, updateBooking, cancelBooking } = useBoard()
  const { notify } = useToast()
  const { promote } = useWaitlist()

  const [day, setDay] = useState(0)
  const [hideUnavailable, setHideUnavailable] = useState(false)
  const [target, setTarget] = useState<SlotTarget | null>(null)
  const [inspected, setInspected] = useState<Booking | null>(null)
  const [inspectedMachine, setInspectedMachine] = useState<Machine | null>(null)
  const [saving, setSaving] = useState(false)
  const [rejections, setRejections] = useState<readonly Rejection[]>([])

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
        notify({
          title: `Booked ${MACHINES_BY_ID.get(draft.machineId)?.name}`,
          description: `${formatWeekMinute(draft.startMinute)} – ${formatClock(draft.endMinute)}`,
          tone: 'success',
        })
      } else {
        setRejections(result.rejections ?? [])
        notify({
          title: 'Booking refused',
          description: result.rejections?.[0]?.message,
          tone: 'error',
        })
      }
    },
    [createBooking, notify],
  )

  // Nudges a booking one slot earlier or later, keeping its length.
  const shift = useCallback(
    async (booking: Booking, slots: number) => {
      const offset = slots * SLOT_MINUTES
      const result = await updateBooking(booking.id, {
        machineId: booking.machineId,
        memberId: booking.memberId,
        startMinute: booking.startMinute + offset,
        endMinute: booking.endMinute + offset,
        note: booking.note,
      })

      if (result.ok && result.booking) {
        setInspected(result.booking)
        notify({
          title: 'Booking moved',
          description: `${formatWeekMinute(result.booking.startMinute)} – ${formatClock(result.booking.endMinute)}`,
          tone: 'success',
        })
      } else {
        notify({
          title: 'Could not move that booking',
          description: result.rejections?.[0]?.message,
          tone: 'error',
        })
      }
    },
    [updateBooking, notify],
  )

  const drop = useCallback(
    async (booking: Booking) => {
      setInspected(null)
      const ok = await cancelBooking(booking.id)

      if (!ok) {
        notify({ title: 'That booking could not be cancelled', tone: 'error' })
        return
      }

      // Someone may have been queuing for exactly this slot; hand it to the
      // first person still eligible before offering the undo.
      const outcome = await promote({
        machineId: booking.machineId,
        startMinute: booking.startMinute,
        endMinute: booking.endMinute,
      })

      if (outcome.promoted) {
        const name = MEMBERS_BY_ID.get(outcome.promoted.memberId)?.name ?? 'the next member'
        notify({
          title: 'Slot passed to the waiting list',
          description: `${name} now holds ${MACHINES_BY_ID.get(booking.machineId)?.name} at ${formatClock(booking.startMinute)}.`,
          tone: 'info',
        })
        return
      }

      notify({
        title: `Cancelled ${MACHINES_BY_ID.get(booking.machineId)?.name}`,
        description: `${formatWeekMinute(booking.startMinute)} is free again`,
        action: {
          label: 'Undo',
          onSelect: () => {
            void createBooking({
              machineId: booking.machineId,
              memberId: booking.memberId,
              startMinute: booking.startMinute,
              endMinute: booking.endMinute,
              note: booking.note,
            })
          },
        },
      })
    },
    [cancelBooking, createBooking, notify, promote],
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
        onSelectMachine={setInspectedMachine}
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

      {inspectedMachine ? (
        <MachineDialog
          machine={inspectedMachine}
          member={member}
          bookings={bookings.filter((booking) => booking.machineId === inspectedMachine.id)}
          onClose={() => setInspectedMachine(null)}
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
            <Badge tone="neutral">{formatDuration(durationOf(inspected))}</Badge>
          </p>
          {inspected.note ? <p className={styles.note}>{inspected.note}</p> : null}

          {inspected.memberId === member.id ? (
            <div className={styles.move}>
              <span className={styles.moveLabel}>Move</span>
              <Button
                size="sm"
                disabled={pendingIds.has(inspected.id)}
                onClick={() => shift(inspected, -1)}
              >
                Half an hour earlier
              </Button>
              <Button
                size="sm"
                disabled={pendingIds.has(inspected.id)}
                onClick={() => shift(inspected, 1)}
              >
                Half an hour later
              </Button>
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  )
}
