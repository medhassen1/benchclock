import { useMemo, useState } from 'react'

import { ServiceLogList } from '@/components/maintenance/ServiceLogList'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast-context'
import { MAINTENANCE_KIND_LABELS, type MaintenanceKind } from '@/data/maintenance'
import { DAY_NAMES, MACHINES, MACHINES_BY_ID, OPENING_HOURS } from '@/data/workshop'
import {
  bookedMinutesForMachine,
  groupWindowsByDay,
  serviceState,
  serviceStatus,
  type ServiceState,
  type ServiceStatus,
} from '@/lib/maintenance'
import {
  formatClock,
  formatDuration,
  formatWeekMinute,
  minuteOfDay,
  slotsForDay,
  weekMinute,
} from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useMaintenance } from '@/state/maintenance-context'
import { useSession } from '@/state/session-context'
import type { Machine } from '@/types'

import styles from './MaintenancePage.module.css'

/** Every status is a word first; the tone and the bar only repeat it. */
const STATE_LABELS: Readonly<Record<ServiceState, string>> = {
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  ok: 'Up to date',
  untracked: 'Not tracked',
}

const STATE_TONES: Readonly<Record<ServiceState, BadgeTone>> = {
  overdue: 'stop',
  'due-soon': 'warn',
  ok: 'ok',
  untracked: 'neutral',
}

const STATE_ICONS: Readonly<Record<ServiceState, string>> = {
  overdue: '✕',
  'due-soon': '!',
  ok: '✓',
  untracked: '–',
}

/** Overdue first, then whatever is closest to falling due. */
const STATE_ORDER: Readonly<Record<ServiceState, number>> = {
  overdue: 0,
  'due-soon': 1,
  ok: 2,
  untracked: 3,
}

const KINDS = Object.keys(MAINTENANCE_KIND_LABELS) as MaintenanceKind[]

function statusDetail(status: ServiceStatus, state: ServiceState): string {
  if (state === 'untracked') return 'No service interval set'
  if (state === 'overdue') {
    return status.overdueMinutes === 0
      ? 'Due now'
      : `${formatDuration(status.overdueMinutes)} past due`
  }
  return `${formatDuration(status.remainingMinutes)} of run time left`
}

export function MaintenancePage() {
  const { member } = useSession()
  const { bookings } = useBoard()
  const { windows, serviceLog, completeService, removeWindow, nextWindowFor } = useMaintenance()
  const { notify } = useToast()

  const [recording, setRecording] = useState<Machine | null>(null)

  const keyholder = member.tier === 'keyholder'

  const rows = useMemo(
    () =>
      MACHINES.map((machine) => {
        const booked = bookedMinutesForMachine(machine.id, bookings)
        const status = serviceStatus(machine.id, booked, serviceLog)

        return {
          machine,
          status,
          state: serviceState(status),
          // From the top of the week: the board covers one week and has no
          // clock, so "next" means the first window still to run in it.
          next: nextWindowFor(machine.id, 0),
        }
      }).sort(
        (a, b) =>
          STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
          b.status.fraction - a.status.fraction ||
          a.machine.name.localeCompare(b.machine.name),
      ),
    [bookings, serviceLog, nextWindowFor],
  )

  const overdue = rows.filter((row) => row.state === 'overdue')
  const byDay = useMemo(() => groupWindowsByDay(windows), [windows])
  const scheduledDays = useMemo(() => [...byDay.keys()].sort((a, b) => a - b), [byDay])

  const recordingRow = rows.find((row) => row.machine.id === recording?.id)

  return (
    <div className={styles.root}>
      <header>
        <h1 className={styles.title}>Maintenance</h1>
        <p className={styles.subtitle}>
          Scheduled downtime for each machine, and how much run time is left before its next
          service.
        </p>
      </header>

      <p className={styles.summary} role="status">
        {overdue.length === 0
          ? 'No machine is overdue for a service.'
          : `${overdue.length} machine${overdue.length === 1 ? '' : 's'} overdue for a service: ${overdue
              .map((row) => row.machine.name)
              .join(', ')}.`}
      </p>

      {keyholder ? null : (
        <p className={styles.note}>
          You are signed in as a {member.tier} member. Only keyholders can record a service.
        </p>
      )}

      <section className={styles.card} aria-labelledby="service-status">
        <h2 id="service-status" className={styles.cardHeading}>
          Service status
        </h2>

        <table className={styles.table}>
          <caption className="visually-hidden">Service status for every machine</caption>
          <thead>
            <tr>
              <th scope="col">Machine</th>
              <th scope="col">Status</th>
              <th scope="col">Run time</th>
              <th scope="col">Next maintenance</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ machine, status, state, next }) => (
              <tr key={machine.id}>
                <th scope="row" className={styles.machineCell}>
                  <span className={styles.code} aria-hidden="true">
                    {machine.code}
                  </span>
                  {machine.name}
                </th>

                <td>
                  <Badge tone={STATE_TONES[state]} icon={STATE_ICONS[state]}>
                    {STATE_LABELS[state]}
                  </Badge>
                </td>

                <td className={styles.runCell}>
                  <span className={styles.detail}>{statusDetail(status, state)}</span>
                  {status.intervalMinutes > 0 ? (
                    <>
                      <span className={styles.faint}>
                        {formatDuration(status.runMinutes)} of{' '}
                        {formatDuration(status.intervalMinutes)}
                      </span>
                      <div className={styles.bar} aria-hidden="true">
                        <span
                          className={state === 'ok' ? styles.barFill : styles.barFillAlert}
                          style={{ inlineSize: `${status.fraction * 100}%` }}
                        />
                      </div>
                    </>
                  ) : null}
                </td>

                <td className={styles.when}>
                  {next ? (
                    <>
                      {formatWeekMinute(next.startMinute)} – {formatClock(next.endMinute)}
                      <span className={styles.faint}>{next.reason}</span>
                    </>
                  ) : (
                    <span className={styles.faint}>None scheduled</span>
                  )}
                </td>

                <td className={styles.actions}>
                  {keyholder ? (
                    <Button size="sm" onClick={() => setRecording(machine)}>
                      Record service
                    </Button>
                  ) : (
                    <span className={styles.faint}>Keyholders only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.card} aria-labelledby="scheduled">
        <h2 id="scheduled" className={styles.cardHeading}>
          This week&rsquo;s downtime
        </h2>

        {scheduledDays.length === 0 ? (
          <p className={styles.faint}>Nothing scheduled this week.</p>
        ) : (
          scheduledDays.map((day) => (
            <div key={day} className={styles.day}>
              <h3 className={styles.dayName}>{DAY_NAMES[day]}</h3>
              <ul className={styles.windows} aria-label={`${DAY_NAMES[day]} maintenance`}>
                {(byDay.get(day) ?? []).map((window) => {
                  const machine = MACHINES_BY_ID.get(window.machineId)

                  return (
                    <li key={window.id} className={styles.window}>
                      <span className={styles.windowTime}>
                        {formatClock(window.startMinute)} – {formatClock(window.endMinute)}
                      </span>
                      <span className={styles.windowMachine}>
                        {machine?.name ?? 'Unknown machine'}
                      </span>
                      <Badge tone="neutral">{MAINTENANCE_KIND_LABELS[window.kind]}</Badge>
                      <span className={styles.faint}>{window.reason}</span>

                      {keyholder ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className={styles.windowAction}
                          onClick={() => {
                            const removed = removeWindow(window.id)
                            notify({
                              title: removed
                                ? `${machine?.name ?? 'Machine'} downtime cancelled`
                                : 'That downtime had already gone',
                              tone: removed ? 'info' : 'warning',
                            })
                          }}
                        >
                          <span className="visually-hidden">
                            Cancel {machine?.name ?? 'machine'} downtime on {DAY_NAMES[day]} at{' '}
                            {formatClock(window.startMinute)}
                          </span>
                          <span aria-hidden="true">Cancel</span>
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className={styles.card} aria-labelledby="log">
        <h2 id="log" className={styles.cardHeading}>
          Service log
        </h2>
        <ServiceLogList entries={serviceLog} />
      </section>

      {recording && recordingRow ? (
        <RecordServiceDialog
          machine={recording}
          runMinutes={recordingRow.status.runMinutes}
          onClose={() => setRecording(null)}
          onRecord={(draft) => {
            const result = completeService({ ...draft, machineId: recording.id }, member)
            notify(
              result.ok
                ? {
                    title: `${recording.name} serviced`,
                    description: 'The service cycle starts again from here.',
                    tone: 'success',
                  }
                : { title: result.reason ?? 'That service could not be recorded', tone: 'error' },
            )
            if (result.ok) setRecording(null)
          }}
        />
      ) : null}
    </div>
  )
}

interface RecordServiceDialogProps {
  machine: Machine
  runMinutes: number
  onClose: () => void
  onRecord: (draft: {
    kind: MaintenanceKind
    notes: string
    minute: number
    runMinutesAtService: number
  }) => void
}

/**
 * Services are dated in week minutes like everything else, so the form picks a
 * day and one of that day's opening slots rather than reading a clock.
 */
function RecordServiceDialog({ machine, runMinutes, onClose, onRecord }: RecordServiceDialogProps) {
  const [kind, setKind] = useState<MaintenanceKind>('service')
  const [day, setDay] = useState(0)
  const [notes, setNotes] = useState('')

  const slots = useMemo(() => slotsForDay(day, OPENING_HOURS), [day])
  const [minuteOfDayValue, setMinuteOfDayValue] = useState(() =>
    minuteOfDay(slotsForDay(0, OPENING_HOURS)[0] ?? 0),
  )

  // A day the workshop opens later may not have the chosen time, so fall back
  // to the first slot rather than submitting an hour that does not exist.
  const chosen = slots.find((slot) => minuteOfDay(slot) === minuteOfDayValue) ?? slots[0]
  const blocked = notes.trim() === '' || chosen === undefined

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record a service for ${machine.name}`}
      description={`${formatDuration(runMinutes)} of run time since the last service`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={blocked}
            onClick={() => {
              if (chosen === undefined) return
              onRecord({
                kind,
                notes: notes.trim(),
                minute: weekMinute(day, minuteOfDay(chosen)),
                runMinutesAtService: runMinutes,
              })
            }}
          >
            Record service
          </Button>
        </>
      }
    >
      <div className={styles.field}>
        <label htmlFor="service-kind" className={styles.label}>
          Work done
        </label>
        <select
          id="service-kind"
          className={styles.input}
          value={kind}
          onChange={(event) => setKind(event.target.value as MaintenanceKind)}
        >
          {KINDS.map((option) => (
            <option key={option} value={option}>
              {MAINTENANCE_KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="service-day" className={styles.label}>
            Day
          </label>
          <select
            id="service-day"
            className={styles.input}
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
          >
            {DAY_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="service-time" className={styles.label}>
            Time
          </label>
          <select
            id="service-time"
            className={styles.input}
            value={chosen === undefined ? '' : minuteOfDay(chosen)}
            onChange={(event) => setMinuteOfDayValue(Number(event.target.value))}
          >
            {slots.map((slot) => (
              <option key={slot} value={minuteOfDay(slot)}>
                {formatClock(slot)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="service-notes" className={styles.label}>
          What was done
        </label>
        <textarea
          id="service-notes"
          className={styles.textarea}
          value={notes}
          maxLength={200}
          rows={3}
          placeholder="Parts replaced, checks made, anything the next person should know"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <p role="status" aria-live="polite" className={styles.status}>
        {blocked
          ? 'Add a note describing the work before recording it.'
          : `Recording resets ${machine.name} to zero run time.`}
      </p>
    </Dialog>
  )
}
