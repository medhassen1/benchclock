import { useId, useState, type FormEvent } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DAY_NAMES } from '@/data/workshop'
import { formatDuration } from '@/lib/weektime'
import {
  clockToMinutes,
  minutesToClock,
  validateDayDraft,
  type ConfigError,
  type ConfigField,
  type DayDraft,
} from '@/lib/workshopConfig'

import styles from './OpeningHoursEditor.module.css'

export interface OpeningHoursEditorProps {
  /** One draft per day, in day order, from `dayDraftsFrom`. */
  drafts: readonly DayDraft[]
  /** The shipped week, restored when the keyholder asks for the defaults. */
  defaults: readonly DayDraft[]
  /** Saves the whole week, returning the reasons it was refused. */
  onSave: (drafts: readonly DayDraft[]) => readonly ConfigError[]
  onReset: () => void
  /** True when the week has been edited away from the shipped hours. */
  changed: boolean
}

interface Row {
  day: number
  closed: boolean
  /** Kept as text so a half-typed time does not become NaN mid-keystroke. */
  open: string
  close: string
}

function rowsFrom(drafts: readonly DayDraft[]): Row[] {
  return drafts.map((draft) => ({
    day: draft.day,
    closed: draft.closed,
    open: minutesToClock(draft.openMinute),
    close: minutesToClock(draft.closeMinute),
  }))
}

/** Unreadable text becomes NaN, which `validateDayDraft` reports as invalid. */
function toDraft(row: Row): DayDraft {
  return {
    day: row.day,
    closed: row.closed,
    openMinute: clockToMinutes(row.open) ?? Number.NaN,
    closeMinute: clockToMinutes(row.close) ?? Number.NaN,
  }
}

/**
 * Edits the week's opening windows. The whole week is saved in one go: the
 * days are validated together and either all land or none do, so the board is
 * never left running on half an edit.
 */
export function OpeningHoursEditor({
  drafts,
  defaults,
  onSave,
  onReset,
  changed,
}: OpeningHoursEditorProps) {
  const fieldId = useId()
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(drafts))
  const [errors, setErrors] = useState<readonly ConfigError[]>([])
  const [saved, setSaved] = useState(false)

  const errorFor = (day: number, field: ConfigField) =>
    errors.find((error) => error.day === day && error.field === field)

  const errorId = (day: number, field: ConfigField) => `${fieldId}-${day}-${field}-error`

  const change = (day: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.day === day ? { ...row, ...patch } : row)))
    setSaved(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const next = rows.map(toDraft)
    // Validated here as well as in the store so a refusal can be shown beside
    // the day that caused it, rather than as one message for the week.
    const refused = next.flatMap((draft) => validateDayDraft(draft))
    if (refused.length > 0) {
      setErrors(refused)
      setSaved(false)
      return
    }

    const rejected = onSave(next)
    setErrors(rejected)
    setSaved(rejected.length === 0)
  }

  const restore = () => {
    onReset()
    setRows(rowsFrom(defaults))
    setErrors([])
    setSaved(false)
  }

  const openDays = rows.filter((row) => !row.closed).length

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${fieldId}-heading`}>
      <header className={styles.header}>
        <h3 id={`${fieldId}-heading`} className={styles.heading}>
          Opening hours
        </h3>
        {changed ? (
          <Badge tone="warn" icon="●">
            Changed from the default
          </Badge>
        ) : (
          <Badge tone="neutral">Default hours</Badge>
        )}
      </header>

      <p className={styles.intro}>
        Bookings may only start and end inside these windows, and a window never crosses midnight.
        The workshop is open on {openDays} of 7 days.
      </p>

      <ul className={styles.days}>
        {rows.map((row) => {
          const openError = errorFor(row.day, 'openMinute')
          const closeError = errorFor(row.day, 'closeMinute')
          const openMinute = clockToMinutes(row.open)
          const closeMinute = clockToMinutes(row.close)
          const length =
            openMinute !== null && closeMinute !== null && closeMinute > openMinute
              ? formatDuration(closeMinute - openMinute)
              : null

          return (
            <li key={row.day}>
              <fieldset className={styles.day}>
                <legend className={styles.legend}>{DAY_NAMES[row.day]}</legend>

                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={row.closed}
                    onChange={(event) => change(row.day, { closed: event.target.checked })}
                  />
                  Closed all day
                  <span className="visually-hidden"> on {DAY_NAMES[row.day]}</span>
                </label>

                <div className={styles.times}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${fieldId}-${row.day}-open`}>
                      Opens
                      <span className="visually-hidden"> on {DAY_NAMES[row.day]}</span>
                    </label>
                    <input
                      id={`${fieldId}-${row.day}-open`}
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      placeholder="17:00"
                      value={row.open}
                      disabled={row.closed}
                      aria-invalid={openError ? true : undefined}
                      aria-describedby={openError ? errorId(row.day, 'openMinute') : undefined}
                      onChange={(event) => change(row.day, { open: event.target.value })}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${fieldId}-${row.day}-close`}>
                      Closes
                      <span className="visually-hidden"> on {DAY_NAMES[row.day]}</span>
                    </label>
                    <input
                      id={`${fieldId}-${row.day}-close`}
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      placeholder="22:00"
                      value={row.close}
                      disabled={row.closed}
                      aria-invalid={closeError ? true : undefined}
                      aria-describedby={closeError ? errorId(row.day, 'closeMinute') : undefined}
                      onChange={(event) => change(row.day, { close: event.target.value })}
                    />
                  </div>

                  {/* The state is spelled out, never left to the row's colour. */}
                  <p className={styles.summary}>
                    {row.closed
                      ? `Closed: nothing can be booked on ${DAY_NAMES[row.day]}.`
                      : `Open ${row.open} to ${row.close}${length ? ` · ${length}` : ''}`}
                  </p>
                </div>

                {openError ? (
                  <p id={errorId(row.day, 'openMinute')} className={styles.error} role="alert">
                    <span aria-hidden="true">✕</span> {DAY_NAMES[row.day]}: {openError.message}
                  </p>
                ) : null}
                {closeError ? (
                  <p id={errorId(row.day, 'closeMinute')} className={styles.error} role="alert">
                    <span aria-hidden="true">✕</span> {DAY_NAMES[row.day]}: {closeError.message}
                  </p>
                ) : null}
              </fieldset>
            </li>
          )
        })}
      </ul>

      <p className={styles.hint}>Times are 24-hour, like 09:00 or 17:30. Midnight is 24:00.</p>

      <div className={styles.actions}>
        <Button type="submit" variant="primary">
          Save opening hours
        </Button>
        <Button onClick={restore} disabled={!changed}>
          Restore default hours
        </Button>
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        {saved ? (
          <span className={styles.saved}>
            <span aria-hidden="true">✓</span> Saved. The board now uses these hours.
          </span>
        ) : null}
      </div>
    </form>
  )
}
