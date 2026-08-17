import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/toast-context'
import { INDUCTIONS, type Induction } from '@/data/inductions'
import { TICKET_LABELS } from '@/data/workshop'
import {
  enrolmentBlockers,
  machinesUnlockedBy,
  seatsInWords,
  seatsRemaining,
} from '@/lib/inductions'
import { durationOf, formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'
import { useStock } from '@/state/stock-context'

import styles from './InductionsPage.module.css'

/** Earliest first: the timetable reads as a week, not as a list of ids. */
const BY_START = (a: Induction, b: Induction) => a.startMinute - b.startMinute

export function InductionsPage() {
  const { member } = useSession()
  const { bookingsForMember } = useBoard()
  const { enrolments, enrol, withdraw, seatsTakenFor, isEnrolled } = useStock()
  const { notify } = useToast()

  const [onlyNeeded, setOnlyNeeded] = useState(false)

  const myBookings = useMemo(() => bookingsForMember(member.id), [bookingsForMember, member.id])

  const sessions = useMemo(() => {
    const sorted = [...INDUCTIONS].sort(BY_START)
    return onlyNeeded
      ? sorted.filter((induction) => !member.tickets.includes(induction.grants))
      : sorted
  }, [onlyNeeded, member.tickets])

  const missing = useMemo(() => {
    const tickets: string[] = []
    for (const induction of INDUCTIONS) {
      if (member.tickets.includes(induction.grants)) continue
      const label = TICKET_LABELS[induction.grants]
      if (!tickets.includes(label)) tickets.push(label)
    }
    return tickets
  }, [member.tickets])

  const mySeats = enrolments.filter((enrolment) => enrolment.memberId === member.id).length

  return (
    <div className={styles.root}>
      <header>
        <h1 className={styles.title}>Inductions</h1>
        <p className={styles.subtitle}>
          Every session grants one sign-off, and a sign-off is what unlocks a machine for
          unsupervised booking.
        </p>
      </header>

      <section className={styles.card} role="group" aria-label="Your sign-offs">
        <h2 className={styles.cardHeading}>Your sign-offs</h2>

        <p className={styles.held}>
          {member.tickets.length > 0
            ? member.tickets.map((ticket) => TICKET_LABELS[ticket]).join(', ')
            : 'You hold no sign-offs yet.'}
        </p>

        <p className={styles.note}>
          {missing.length === 0 ? (
            <Badge tone="ok" icon="✓">
              Every sign-off on the timetable is yours
            </Badge>
          ) : (
            <Badge tone="warn" icon="!">
              {missing.length} still to earn: {missing.join(', ')}
            </Badge>
          )}
        </p>

        <p className={styles.seatsHeld}>
          {mySeats === 0
            ? 'You have no induction seats booked.'
            : `You have ${mySeats === 1 ? 'one seat' : `${mySeats} seats`} booked.`}
        </p>
      </section>

      <div className={styles.toolbar}>
        <label className={styles.filter}>
          <input
            type="checkbox"
            checked={onlyNeeded}
            onChange={(event) => setOnlyNeeded(event.target.checked)}
          />
          <span>Only sign-offs I still need</span>
        </label>
      </div>

      {sessions.length === 0 ? (
        <p className={styles.empty}>
          Nothing left to attend — you already hold every sign-off on the timetable.
        </p>
      ) : (
        <ul className={styles.list}>
          {sessions.map((induction) => {
            const blockers = enrolmentBlockers({
              induction,
              member,
              enrolments,
              bookings: myBookings,
            })
            const enrolled = isEnrolled(induction.id, member.id)
            const taken = seatsTakenFor(induction.id)
            const remaining = seatsRemaining(induction, enrolments)
            const unlocks = machinesUnlockedBy(induction.grants)
            const reasonId = `${induction.id}-reason`
            const titleId = `${induction.id}-title`

            return (
              <li key={induction.id}>
                <article className={styles.session} aria-labelledby={titleId}>
                  <div className={styles.sessionMain}>
                    <h2 id={titleId} className={styles.sessionTitle}>
                      {induction.title}
                    </h2>

                    <p className={styles.when}>
                      {formatWeekMinute(induction.startMinute)} –{' '}
                      {formatClock(induction.endMinute)} ·{' '}
                      {formatDuration(durationOf(induction))}
                    </p>

                    <p className={styles.meta}>
                      {induction.trainer} · {induction.location}
                    </p>

                    <p className={styles.unlocks}>
                      <span className={styles.unlocksLabel}>Grants</span>{' '}
                      <Badge tone="accent">{TICKET_LABELS[induction.grants]}</Badge>{' '}
                      {unlocks.length > 0
                        ? `— unlocks ${unlocks.map((machine) => machine.name).join(', ')}`
                        : '— no machine needs this sign-off right now'}
                    </p>
                  </div>

                  <div className={styles.sessionSide}>
                    <p className={styles.seats}>{seatsInWords(remaining)}</p>

                    <div
                      className={styles.meter}
                      role="meter"
                      aria-valuenow={taken}
                      aria-valuemin={0}
                      aria-valuemax={induction.capacity}
                      aria-label={`Seats taken on ${induction.title}`}
                    >
                      <span
                        className={styles.meterFill}
                        style={{
                          inlineSize:
                            induction.capacity > 0
                              ? `${Math.min(100, (taken / induction.capacity) * 100)}%`
                              : '100%',
                        }}
                      />
                    </div>

                    {enrolled ? (
                      <>
                        <Badge tone="ok" icon="✓">
                          Your seat is booked
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const ok = withdraw(induction.id, member.id)
                            notify(
                              ok
                                ? { title: `Seat given up on ${induction.title}`, tone: 'info' }
                                : { title: 'That seat could not be given up', tone: 'error' },
                            )
                          }}
                        >
                          Withdraw
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={blockers.length > 0}
                        aria-describedby={blockers.length > 0 ? reasonId : undefined}
                        onClick={() => {
                          const ok = enrol(induction.id, member.id)
                          notify(
                            ok
                              ? { title: `Seat booked on ${induction.title}`, tone: 'success' }
                              : { title: 'That seat could not be booked', tone: 'error' },
                          )
                        }}
                      >
                        Enrol
                      </Button>
                    )}

                    {/* The reason is always written out; the disabled control alone
                        would leave a member guessing why. */}
                    {!enrolled && blockers.length > 0 ? (
                      <p id={reasonId} className={styles.reason}>
                        <span aria-hidden="true" className={styles.reasonMark}>
                          ✕
                        </span>
                        {blockers.map((blocker) => blocker.message).join(' ')}
                      </p>
                    ) : null}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
