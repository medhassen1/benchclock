import { useMemo } from 'react'

import { OccupancyHeatmap } from '@/components/reports/OccupancyHeatmap'
import { StatTile } from '@/components/reports/StatTile'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DAY_NAMES, MACHINE_KIND_LABELS, MEMBERS } from '@/data/workshop'
import { usePersistentState } from '@/hooks/usePersistentState'
import {
  compareWeeks,
  formatPercent,
  machineUtilisation,
  memberLeaderboard,
  occupancyMatrix,
  peakHours,
  quietSlots,
  weekSummary,
  type Delta,
} from '@/lib/reports'
import { formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'
import type { Booking } from '@/types'

import styles from './ReportsPage.module.css'

/**
 * The baseline lives beside the board rather than in `STORAGE_KEYS`, because
 * it is a reporting convenience: losing it costs a comparison, never a
 * booking.
 */
const BASELINE_KEY = 'benchclock:reports:baseline:v1'

function isBooking(raw: unknown): raw is Booking {
  if (typeof raw !== 'object' || raw === null) return false
  const value = raw as Record<string, unknown>

  return (
    typeof value.id === 'string' &&
    typeof value.machineId === 'string' &&
    typeof value.memberId === 'string' &&
    typeof value.startMinute === 'number' &&
    typeof value.endMinute === 'number'
  )
}

function parseBaseline(raw: unknown): Booking[] | null {
  return Array.isArray(raw) && raw.every(isBooking) ? raw : null
}

/** `1 h 30 m more than the baseline week`, or that nothing moved. */
function describeChange(delta: Delta, format: (value: number) => string): string {
  if (delta.direction === 'flat') return 'Level with the baseline week'
  const word = delta.direction === 'up' ? 'more than' : 'less than'
  return `${format(Math.abs(delta.delta))} ${word} the baseline week`
}

const countLabel = (value: number, noun: string) =>
  `${value} ${noun}${value === 1 ? '' : 's'}`

/** Percentage points, which is what a difference of two percentages is. */
const pointsLabel = (value: number) =>
  `${Math.round(value * 100)} point${Math.round(value * 100) === 1 ? '' : 's'}`

/**
 * Turns the week's bookings into the numbers a workshop actually acts on:
 * which machines are saturated, when the crush is, and where the free benches
 * hide.
 *
 * A saved baseline is the only history the app has, so week-over-week figures
 * are shown against it and hidden entirely until one exists — an invented
 * comparison would be worse than none.
 */
export function ReportsPage() {
  const { bookings } = useBoard()
  const { member } = useSession()
  const [baseline, setBaseline] = usePersistentState<Booking[]>(BASELINE_KEY, [], parseBaseline)

  const summary = useMemo(() => weekSummary(bookings), [bookings])
  const matrix = useMemo(() => occupancyMatrix(bookings), [bookings])
  const peaks = useMemo(() => peakHours(matrix, 5), [matrix])
  const quiet = useMemo(() => quietSlots(bookings, { limit: 5 }), [bookings])
  const perMachine = useMemo(() => machineUtilisation(bookings), [bookings])
  const standings = useMemo(() => memberLeaderboard(bookings), [bookings])
  const comparison = useMemo(() => compareWeeks(baseline, bookings), [baseline, bookings])

  const hasBaseline = baseline.length > 0
  const busiestMinutes = perMachine[0]?.bookedMinutes ?? 0

  return (
    <div className={styles.root}>
      <header>
        <h1 className={styles.title}>Reports</h1>
        <p className={styles.subtitle}>
          How the workshop was used this week, measured against the hours it was open.
        </p>
      </header>

      <section className={styles.tiles} aria-label="Headline figures">
        <StatTile
          label="Workshop utilisation"
          value={formatPercent(summary.fraction)}
          note={`${formatDuration(summary.bookedMinutes)} booked of ${formatDuration(summary.bookableMinutes)} bookable`}
          trend={hasBaseline ? comparison.utilisation.direction : undefined}
          trendNote={
            hasBaseline ? describeChange(comparison.utilisation, pointsLabel) : undefined
          }
        />
        <StatTile
          label="Machine time booked"
          value={formatDuration(summary.bookedMinutes)}
          note={`Across ${countLabel(summary.bookingCount, 'booking')}`}
          trend={hasBaseline ? comparison.bookedMinutes.direction : undefined}
          trendNote={
            hasBaseline ? describeChange(comparison.bookedMinutes, formatDuration) : undefined
          }
        />
        <StatTile
          label="Busiest machine"
          value={summary.busiest?.machine.name ?? 'Nothing booked'}
          note={
            summary.busiest
              ? `${formatPercent(summary.busiest.fraction)} of its bookable hours`
              : 'No machine has been booked this week'
          }
        />
        <StatTile
          label="Members booking"
          value={summary.activeMembers}
          note={`Of ${countLabel(MEMBERS.length, 'member')} on the books`}
          trend={hasBaseline ? comparison.activeMembers.direction : undefined}
          trendNote={
            hasBaseline
              ? describeChange(comparison.activeMembers, (value) => countLabel(value, 'member'))
              : undefined
          }
        />
      </section>

      <section className={styles.card} aria-labelledby="baseline-heading">
        <h2 id="baseline-heading" className={styles.cardHeading}>
          Week-over-week baseline
        </h2>

        <div className={styles.baseline}>
          <p className={styles.baselineState}>
            {hasBaseline ? (
              <Badge tone="accent" icon="↔">
                Comparing with {countLabel(baseline.length, 'saved booking')}
              </Badge>
            ) : (
              <Badge tone="neutral" icon="–">
                No baseline saved yet
              </Badge>
            )}
          </p>

          <div className={styles.baselineActions}>
            <Button variant="primary" onClick={() => setBaseline([...bookings])}>
              Save this week as the baseline
            </Button>
            <Button variant="ghost" disabled={!hasBaseline} onClick={() => setBaseline([])}>
              Clear baseline
            </Button>
          </div>
        </div>

        <p className={styles.hint}>
          The board only ever holds the current week, so a saved snapshot is what every
          &ldquo;than last week&rdquo; figure is measured against.
        </p>
      </section>

      <section className={styles.card} aria-labelledby="heatmap-heading">
        <h2 id="heatmap-heading" className={styles.cardHeading}>
          Occupancy
        </h2>
        <OccupancyHeatmap matrix={matrix} />
      </section>

      <section className={styles.card} aria-labelledby="machines-heading">
        <h2 id="machines-heading" className={styles.cardHeading}>
          Machine utilisation
        </h2>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Machine</th>
              <th scope="col">Type</th>
              <th scope="col">Bookings</th>
              <th scope="col">Booked</th>
              <th scope="col">Utilisation</th>
              <th scope="col">
                <span className="visually-hidden">Relative demand</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {perMachine.map((row) => (
              <tr key={row.machine.id}>
                <th scope="row" className={styles.nameCell}>
                  {row.machine.name}
                  {row.machine.outOfService ? (
                    <Badge tone="stop" icon="✕">
                      Out of service
                    </Badge>
                  ) : null}
                </th>
                <td className={styles.muted}>{MACHINE_KIND_LABELS[row.machine.kind]}</td>
                <td className={styles.numeric}>{row.bookings}</td>
                <td className={styles.numeric}>{formatDuration(row.bookedMinutes)}</td>
                <td className={styles.numeric}>
                  {row.bookableMinutes === 0 ? 'Not bookable' : formatPercent(row.fraction)}
                </td>
                <td className={styles.barCell}>
                  <div className={styles.bar} aria-hidden="true">
                    <span
                      className={styles.barFill}
                      style={{
                        inlineSize:
                          busiestMinutes > 0
                            ? `${(row.bookedMinutes / busiestMinutes) * 100}%`
                            : '0%',
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className={styles.pair}>
        <section className={styles.card} aria-labelledby="peaks-heading">
          <h2 id="peaks-heading" className={styles.cardHeading}>
            Peak hours
          </h2>

          {peaks.length === 0 ? (
            <p className={styles.hint}>The workshop has no open hours to rank.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">When</th>
                  <th scope="col">Booked</th>
                  <th scope="col">Full</th>
                </tr>
              </thead>
              <tbody>
                {peaks.map((peak) => (
                  <tr key={`${peak.day}-${peak.hour}`}>
                    <td className={styles.numeric}>{peak.rank}</td>
                    <th scope="row" className={styles.nameCell}>
                      {DAY_NAMES[peak.day]} {formatClock(peak.hour * 60)}
                    </th>
                    <td className={styles.numeric}>{formatDuration(peak.bookedMinutes)}</td>
                    <td className={styles.numeric}>{formatPercent(peak.fraction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.card} aria-labelledby="quiet-heading">
          <h2 id="quiet-heading" className={styles.cardHeading}>
            Quiet slots
          </h2>

          {quiet.length === 0 ? (
            <p className={styles.hint}>There are no bookable slots to suggest.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Slot</th>
                  <th scope="col">Free machines</th>
                  <th scope="col">Taken</th>
                </tr>
              </thead>
              <tbody>
                {quiet.map((slot) => (
                  <tr key={slot.startMinute}>
                    <th scope="row" className={styles.nameCell}>
                      {formatWeekMinute(slot.startMinute)} – {formatClock(slot.endMinute)}
                    </th>
                    <td className={styles.numeric}>
                      {slot.freeMachines} of {slot.freeMachines + slot.bookedMachines}
                    </td>
                    <td className={styles.numeric}>{formatPercent(slot.fraction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className={styles.card} aria-labelledby="members-heading">
        <h2 id="members-heading" className={styles.cardHeading}>
          Member leaderboard
        </h2>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Member</th>
              <th scope="col">Bookings</th>
              <th scope="col">Booked</th>
              <th scope="col">Allowance used</th>
              <th scope="col">Share of week</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing) => (
              <tr key={standing.member.id}>
                <td className={styles.numeric}>{standing.rank}</td>
                <th scope="row" className={styles.nameCell}>
                  {standing.member.name}
                  {standing.member.id === member.id ? <Badge tone="accent">You</Badge> : null}
                </th>
                <td className={styles.numeric}>{standing.bookings}</td>
                <td className={styles.numeric}>{formatDuration(standing.bookedMinutes)}</td>
                <td className={styles.allowanceCell}>
                  <span className={styles.numeric}>
                    {formatDuration(standing.bookedMinutes)} of{' '}
                    {formatDuration(standing.allowance)}
                  </span>
                  <div className={styles.bar} aria-hidden="true">
                    <span
                      className={styles.barFill}
                      style={{ inlineSize: `${standing.allowanceFraction * 100}%` }}
                    />
                  </div>
                </td>
                <td className={styles.numeric}>{formatPercent(standing.shareOfWeek)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
