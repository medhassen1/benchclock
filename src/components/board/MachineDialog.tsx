import { useMemo } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { MACHINE_KIND_LABELS, MEMBERS_BY_ID, TICKET_LABELS } from '@/data/workshop'
import { durationOf, formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import type { Booking, Machine, Member } from '@/types'

import styles from './MachineDialog.module.css'

export interface MachineDialogProps {
  machine: Machine
  member: Member
  /** Every booking for this machine, in any day of the week. */
  bookings: readonly Booking[]
  onClose: () => void
}

export function MachineDialog({ machine, member, bookings, onClose }: MachineDialogProps) {
  const upcoming = useMemo(
    () => [...bookings].sort((a, b) => a.startMinute - b.startMinute),
    [bookings],
  )

  const bookedMinutes = useMemo(
    () => upcoming.reduce((sum, booking) => sum + durationOf(booking), 0),
    [upcoming],
  )

  const hasTicket = !machine.requiredTicket || member.tickets.includes(machine.requiredTicket)

  return (
    <Dialog
      open
      onClose={onClose}
      title={machine.name}
      description={`${MACHINE_KIND_LABELS[machine.kind]} · ${machine.location}`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className={styles.badges}>
        <Badge tone="neutral">{machine.code}</Badge>
        {machine.outOfService ? (
          <Badge tone="stop" icon="✕">
            Out of service
          </Badge>
        ) : (
          <Badge tone="ok" icon="✓">
            In service
          </Badge>
        )}
        <Badge tone={hasTicket ? 'ok' : 'stop'} icon={hasTicket ? '✓' : '✕'}>
          {machine.requiredTicket
            ? `${TICKET_LABELS[machine.requiredTicket]}${hasTicket ? ' held' : ' needed'}`
            : 'No sign-off needed'}
        </Badge>
      </div>

      <dl className={styles.specs}>
        <div className={styles.spec}>
          <dt>Longest booking</dt>
          <dd>{formatDuration(machine.maxSessionMinutes)}</dd>
        </div>
        <div className={styles.spec}>
          <dt>Cool-down</dt>
          <dd>{machine.cooldownMinutes > 0 ? formatDuration(machine.cooldownMinutes) : 'None'}</dd>
        </div>
        <div className={styles.spec}>
          <dt>Booked this week</dt>
          <dd>{formatDuration(bookedMinutes)}</dd>
        </div>
      </dl>

      <section aria-labelledby="machine-schedule">
        <h3 id="machine-schedule" className={styles.heading}>
          This week
        </h3>

        {upcoming.length === 0 ? (
          <p className={styles.free}>Nothing booked — the whole week is open.</p>
        ) : (
          <ul className={styles.list}>
            {upcoming.map((booking) => {
              const mine = booking.memberId === member.id
              return (
                <li key={booking.id} className={styles.row}>
                  <span className={styles.when}>
                    {formatWeekMinute(booking.startMinute)} – {formatClock(booking.endMinute)}
                  </span>
                  <span className={styles.who}>
                    {mine ? (
                      <Badge tone="accent">You</Badge>
                    ) : (
                      (MEMBERS_BY_ID.get(booking.memberId)?.name ?? 'A member')
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </Dialog>
  )
}
