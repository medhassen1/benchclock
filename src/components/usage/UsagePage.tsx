import { useMemo } from 'react'

import { Badge } from '@/components/ui/Badge'
import { MACHINES, MACHINE_KIND_LABELS, MEMBERS, TICKET_LABELS } from '@/data/workshop'
import { allowanceUsage, minutesBookedBy } from '@/lib/rules'
import { durationOf, formatDuration } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'

import styles from './UsagePage.module.css'

export function UsagePage() {
  const { member } = useSession()
  const { bookings } = useBoard()

  const usage = useMemo(() => allowanceUsage(member, bookings), [member, bookings])

  const perMachine = useMemo(
    () =>
      MACHINES.map((machine) => {
        const own = bookings.filter((booking) => booking.machineId === machine.id)
        return {
          machine,
          count: own.length,
          minutes: own.reduce((sum, booking) => sum + durationOf(booking), 0),
        }
      }).sort((a, b) => b.minutes - a.minutes),
    [bookings],
  )

  const busiest = perMachine[0]?.minutes ?? 0

  return (
    <div className={styles.root}>
      <header>
        <h1 className={styles.title}>Usage</h1>
        <p className={styles.subtitle}>
          Your weekly allowance, and how busy each machine is across the whole workshop.
        </p>
      </header>

      <section className={styles.card} role="group" aria-label="Your allowance">
        <h2 className={styles.cardHeading}>Your allowance</h2>

        <p className={styles.big}>
          {formatDuration(usage.used)} <span className={styles.of}>of</span>{' '}
          {formatDuration(usage.allowance)}
        </p>

        <div
          className={styles.meter}
          role="meter"
          aria-valuenow={Math.round(usage.fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Allowance used"
        >
          <span className={styles.meterFill} style={{ inlineSize: `${usage.fraction * 100}%` }} />
        </div>

        <p className={styles.note}>
          {usage.remaining === 0 ? (
            <Badge tone="stop" icon="✕">
              Allowance used up
            </Badge>
          ) : (
            <Badge tone="ok" icon="✓">
              {formatDuration(usage.remaining)} still bookable
            </Badge>
          )}
        </p>

        {member.tickets.length > 0 ? (
          <p className={styles.tickets}>
            <span className={styles.ticketsLabel}>Sign-offs:</span>{' '}
            {member.tickets.map((ticket) => TICKET_LABELS[ticket]).join(', ')}
          </p>
        ) : (
          <p className={styles.tickets}>
            <span className={styles.ticketsLabel}>Sign-offs:</span> none yet
          </p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="by-machine">
        <h2 id="by-machine" className={styles.cardHeading}>
          Machine demand
        </h2>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Machine</th>
              <th scope="col">Type</th>
              <th scope="col">Bookings</th>
              <th scope="col">Booked</th>
              <th scope="col">
                <span className="visually-hidden">Relative demand</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {perMachine.map(({ machine, count, minutes }) => (
              <tr key={machine.id}>
                <th scope="row" className={styles.machineCell}>
                  {machine.name}
                  {machine.outOfService ? (
                    <Badge tone="stop" icon="✕">
                      Out of service
                    </Badge>
                  ) : null}
                </th>
                <td className={styles.muted}>{MACHINE_KIND_LABELS[machine.kind]}</td>
                <td className={styles.numeric}>{count}</td>
                <td className={styles.numeric}>{formatDuration(minutes)}</td>
                <td className={styles.barCell}>
                  <div className={styles.bar} aria-hidden="true">
                    <span
                      className={styles.barFill}
                      style={{ inlineSize: busiest > 0 ? `${(minutes / busiest) * 100}%` : '0%' }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.card} aria-labelledby="by-member">
        <h2 id="by-member" className={styles.cardHeading}>
          Members
        </h2>

        <ul className={styles.memberList}>
          {MEMBERS.map((entry) => {
            const used = minutesBookedBy(entry.id, bookings)
            return (
              <li key={entry.id} className={styles.memberRow}>
                <span className={styles.memberName}>
                  {entry.name}
                  {entry.id === member.id ? <Badge tone="accent">You</Badge> : null}
                </span>
                <span className={styles.muted}>
                  {formatDuration(used)} of {formatDuration(entry.weeklyMinuteAllowance)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
