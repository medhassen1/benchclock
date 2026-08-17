import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast-context'
import { MACHINES_BY_ID, OPENING_HOURS, SLOT_MINUTES, TICKET_LABELS } from '@/data/workshop'
import {
  MAX_REPEAT_COUNT,
  MIN_REPEAT_COUNT,
  makeSeriesId,
  planSeries,
  SERIES_MODES,
  SERIES_MODE_LABELS,
  summariseSeries,
  type SeriesDefinition,
  type SeriesMode,
  type SeriesPlan,
} from '@/lib/recurrence'
import { formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSeries } from '@/state/series-context'
import { useSession } from '@/state/session-context'

import styles from './SeriesDialog.module.css'

export interface SeriesDialogProps {
  machineId: string
  /** Week-minute of the slot the series repeats on. */
  startMinute: number
  onClose: () => void
  /** Called once the series is stored, with the plan that was applied. */
  onCreated?: (series: SeriesDefinition, plan: SeriesPlan) => void
}

const LENGTH_CHOICES = [30, 60, 90, 120, 180]

/** Weeks read better as a position in time than as an index. */
function weekLabel(weekIndex: number): string {
  if (weekIndex === 0) return 'This week'
  if (weekIndex === 1) return 'Next week'
  return `In ${weekIndex} weeks`
}

export function SeriesDialog({ machineId, startMinute, onClose, onCreated }: SeriesDialogProps) {
  const { member } = useSession()
  const { bookings, createBooking } = useBoard()
  const { series, addSeries } = useSeries()
  const { notify } = useToast()

  const machine = MACHINES_BY_ID.get(machineId)
  const [lengthMinutes, setLengthMinutes] = useState(SLOT_MINUTES * 2)
  const [repeatCount, setRepeatCount] = useState(4)
  const [mode, setMode] = useState<SeriesMode>('skip-refused')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Previewing under the id the series will really get keeps the occurrence
  // ids in the preview the same as the ones that end up stored.
  const definition = useMemo<SeriesDefinition>(
    () => ({
      id: makeSeriesId(series.map((existing) => existing.id)),
      machineId,
      memberId: member.id,
      startMinute,
      endMinute: startMinute + lengthMinutes,
      note: note.trim(),
      repeatCount,
      mode,
      createdAt: 0,
    }),
    [series, machineId, member.id, startMinute, lengthMinutes, note, repeatCount, mode],
  )

  // Derived during render, so every change of length, count, or mode is judged
  // by the same rules the board will apply on submit.
  const plan = useMemo(
    () =>
      machine
        ? planSeries(definition, {
            machine,
            member,
            existing: bookings,
            otherSeries: series,
            hours: OPENING_HOURS,
          })
        : null,
    [definition, machine, member, bookings, series],
  )

  if (!machine || !plan) return null

  const summary = summariseSeries(plan)

  const confirm = async () => {
    setSaving(true)
    const stored = addSeries({
      machineId: definition.machineId,
      memberId: definition.memberId,
      startMinute: definition.startMinute,
      endMinute: definition.endMinute,
      note: definition.note,
      repeatCount: definition.repeatCount,
      mode: definition.mode,
    })

    // Only the current week exists on the board; the rest of the series waits
    // in the definition until its week comes round.
    const thisWeek = plan.applied.find((occurrence) => occurrence.weekIndex === 0)
    const result = thisWeek ? await createBooking(thisWeek.draft) : null

    setSaving(false)
    notify({
      title: `Series booked on ${machine.name}`,
      description:
        result && !result.ok
          ? `${summary.text} This week could not be put on the board.`
          : summary.text,
      tone: result && !result.ok ? 'warning' : 'success',
    })

    onCreated?.(stored, plan)
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Repeat ${machine.name} weekly`}
      description={`${formatWeekMinute(startMinute)} · ${machine.location}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!plan.ok} onClick={confirm}>
            Book series
          </Button>
        </>
      }
    >
      <div className={styles.meta}>
        <Badge tone="neutral">{machine.code}</Badge>
        <Badge tone="neutral">Max {formatDuration(machine.maxSessionMinutes)}</Badge>
        {machine.requiredTicket ? (
          <Badge
            tone={member.tickets.includes(machine.requiredTicket) ? 'ok' : 'stop'}
            icon={member.tickets.includes(machine.requiredTicket) ? '✓' : '✕'}
          >
            {TICKET_LABELS[machine.requiredTicket]}
          </Badge>
        ) : null}
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.legend}>Length</legend>
        <div className={styles.choices}>
          {LENGTH_CHOICES.map((minutes) => (
            <label key={minutes} className={styles.choice}>
              <input
                type="radio"
                name="series-length"
                value={minutes}
                checked={lengthMinutes === minutes}
                onChange={() => setLengthMinutes(minutes)}
              />
              <span>{formatDuration(minutes)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className={styles.range}>
        {formatClock(definition.startMinute)} – {formatClock(definition.endMinute)}, every week
      </p>

      <div className={styles.field}>
        <label htmlFor="series-repeat" className={styles.legend}>
          Repeats for
        </label>
        <select
          id="series-repeat"
          className={styles.select}
          value={repeatCount}
          onChange={(event) => setRepeatCount(Number(event.target.value))}
        >
          {Array.from({ length: MAX_REPEAT_COUNT - MIN_REPEAT_COUNT + 1 }, (_, index) => {
            const weeks = MIN_REPEAT_COUNT + index
            return (
              <option key={weeks} value={weeks}>
                {weeks === 1 ? '1 week' : `${weeks} weeks`}
              </option>
            )
          })}
        </select>
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.legend}>If a week is already taken</legend>
        <div className={styles.modes}>
          {SERIES_MODES.map((option) => (
            <label key={option} className={styles.choice}>
              <input
                type="radio"
                name="series-mode"
                value={option}
                checked={mode === option}
                onChange={() => setMode(option)}
              />
              <span>{SERIES_MODE_LABELS[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.field}>
        <label htmlFor="series-note" className={styles.legend}>
          Note <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="series-note"
          className={styles.input}
          type="text"
          value={note}
          maxLength={80}
          placeholder="What are you making?"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div role="status" aria-live="polite" className={styles.status}>
        {summary.text}
      </div>

      <ol className={styles.preview} aria-label="Weeks in this series">
        {plan.outcomes.map((outcome) => {
          const booked = plan.applied.some(
            (occurrence) => occurrence.id === outcome.occurrence.id,
          )

          return (
            <li key={outcome.occurrence.id} className={styles.week}>
              <p className={styles.weekHead}>
                <span className={styles.weekName}>{weekLabel(outcome.occurrence.weekIndex)}</span>
                <span className={booked ? styles.accepted : styles.refused}>
                  <span aria-hidden="true">{booked ? '✓' : '✕'}</span>{' '}
                  {booked ? 'Will be booked' : 'Not booked'}
                </span>
              </p>
              {outcome.rejections.length > 0 ? (
                <ul className={styles.reasons}>
                  {outcome.rejections.map((rejection) => (
                    <li key={rejection.code}>{rejection.message}</li>
                  ))}
                </ul>
              ) : null}
              {outcome.accepted && !booked ? (
                <p className={styles.reasons}>
                  Held back because every week must be free in this mode.
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </Dialog>
  )
}
