import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast-context'
import { MACHINES_BY_ID } from '@/data/workshop'
import {
  occurrenceCount,
  seriesTotalMinutes,
  type SeriesDefinition,
} from '@/lib/recurrence'
import { formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSeries } from '@/state/series-context'
import { useSession } from '@/state/session-context'
import type { Booking } from '@/types'

import styles from './SeriesPage.module.css'

const MODE_SUMMARIES: Readonly<Record<SeriesDefinition['mode'], string>> = {
  'skip-refused': 'Skips taken weeks',
  'all-or-nothing': 'All weeks or none',
}

const weekWord = (count: number) => (count === 1 ? '1 week' : `${count} weeks`)

/**
 * A booking carries no series id, so the occurrence a series put on the board
 * is recognised by the member, machine, and slot it repeats on.
 */
function boardBookingFor(
  definition: SeriesDefinition,
  bookings: readonly Booking[],
): Booking | undefined {
  return bookings.find(
    (booking) =>
      booking.memberId === definition.memberId &&
      booking.machineId === definition.machineId &&
      booking.startMinute === definition.startMinute &&
      booking.endMinute === definition.endMinute,
  )
}

export function SeriesPage() {
  const { member } = useSession()
  const { seriesForMember, cancelSeries } = useSeries()
  const { bookings, cancelBooking } = useBoard()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState<SeriesDefinition | null>(null)

  const mine = useMemo(() => seriesForMember(member.id), [seriesForMember, member.id])
  const totalMinutes = useMemo(
    () => mine.reduce((sum, definition) => sum + seriesTotalMinutes(definition), 0),
    [mine],
  )

  if (mine.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyMark} aria-hidden="true">
          ↻
        </span>
        <h1 className={styles.title}>No repeating bookings</h1>
        <p className={styles.subtitle}>
          Book a slot on the board and repeat it weekly to see the series here.
        </p>
        <Link className={styles.cta} to="/">
          Go to the board
        </Link>
      </div>
    )
  }

  const confirmingMachine = confirming ? MACHINES_BY_ID.get(confirming.machineId) : undefined
  const confirmingBooking = confirming ? boardBookingFor(confirming, bookings) : undefined

  const cancel = async (definition: SeriesDefinition) => {
    const booking = boardBookingFor(definition, bookings)
    cancelSeries(definition.id)

    // The week already on the board is a booking of its own; dropping the
    // definition alone would leave it behind with nothing to explain it.
    const removed = booking ? await cancelBooking(booking.id) : true

    notify(
      removed
        ? { title: 'Series cancelled', tone: 'info' }
        : {
            title: 'Series cancelled',
            description: 'This week’s booking is still on the board.',
            tone: 'warning',
          },
    )
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Repeating bookings</h1>
          <p className={styles.subtitle}>
            {mine.length === 1 ? '1 series' : `${mine.length} series`},{' '}
            {formatDuration(totalMinutes)} of machine time booked ahead.
          </p>
        </div>
      </header>

      <table className={styles.table}>
        <caption className="visually-hidden">Your repeating bookings</caption>
        <thead>
          <tr>
            <th scope="col">Machine</th>
            <th scope="col">When</th>
            <th scope="col">Repeats</th>
            <th scope="col">Total</th>
            <th scope="col">Note</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {mine.map((definition) => {
            const machine = MACHINES_BY_ID.get(definition.machineId)
            const weeks = occurrenceCount(definition)
            const onBoard = boardBookingFor(definition, bookings) !== undefined

            return (
              <tr key={definition.id}>
                <th scope="row" className={styles.machineCell}>
                  <span className={styles.code} aria-hidden="true">
                    {machine?.code}
                  </span>
                  {machine?.name ?? 'Unknown machine'}
                </th>
                <td className={styles.when}>
                  {formatWeekMinute(definition.startMinute)} –{' '}
                  {formatClock(definition.endMinute)}
                </td>
                <td>
                  <span className={styles.weeks}>{weekWord(weeks)}</span>
                  <span className={styles.mode}>{MODE_SUMMARIES[definition.mode]}</span>
                </td>
                <td className={styles.numeric}>{formatDuration(seriesTotalMinutes(definition))}</td>
                <td className={styles.note}>
                  {definition.note || <span className={styles.faint}>—</span>}
                </td>
                <td className={styles.actions}>
                  <Badge tone={onBoard ? 'ok' : 'neutral'} icon={onBoard ? '✓' : '·'}>
                    {onBoard ? 'On the board this week' : 'Not on the board this week'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(definition)}>
                    Cancel
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Cancel this series?"
        description={
          confirming
            ? `${confirmingMachine?.name ?? 'Unknown machine'} · ${formatWeekMinute(confirming.startMinute)}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const definition = confirming
                setConfirming(null)
                if (definition) await cancel(definition)
              }}
            >
              Cancel series
            </Button>
          </>
        }
      >
        <p>
          {confirming ? weekWord(occurrenceCount(confirming)) : 'No weeks'} of machine time go
          back on the board.
          {confirmingBooking ? ' This week’s booking is cancelled too.' : ''}
        </p>
      </Dialog>
    </div>
  )
}
