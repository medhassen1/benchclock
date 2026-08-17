import { useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/toast-context'
import { MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'
import { BOOKING_CSV_HEADER, bookingsToCsv, parseBookingsCsv } from '@/lib/csv'
import { durationOf, formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import { useOptionalAudit } from '@/state/audit-context'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'

import styles from './DataPage.module.css'

interface Refusal {
  label: string
  message: string
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export function DataPage() {
  const { bookings, createBooking } = useBoard()
  const { member } = useSession()
  const { notify } = useToast()
  // The trail is optional: this page still works when it is not mounted.
  const audit = useOptionalAudit()

  const exportRef = useRef<HTMLTextAreaElement>(null)
  const [copyMessage, setCopyMessage] = useState('')

  const [paste, setPaste] = useState('')
  const [applying, setApplying] = useState(false)
  const [refusals, setRefusals] = useState<readonly Refusal[]>([])
  const [outcome, setOutcome] = useState('')

  // Line feeds rather than CRLF: a textarea normalises its value to line
  // feeds anyway, so writing them keeps what is shown and what is copied equal.
  const csv = useMemo(() => bookingsToCsv(bookings, { eol: '\n' }), [bookings])

  // Parsing on every keystroke is cheap and means the preview and the errors
  // are never one edit behind what has been pasted.
  const parsed = useMemo(() => parseBookingsCsv(paste), [paste])

  const copy = async () => {
    const field = exportRef.current
    field?.focus()
    field?.select()

    audit?.record({
      actorId: member.id,
      action: 'bookings-exported',
      subject: 'CSV',
      details: plural(bookings.length, 'booking'),
    })

    // Clipboard access is denied outside a secure context and in some
    // browsers; the selection above is the fallback, so say so rather than
    // claiming a copy that never happened.
    if (!navigator.clipboard) {
      setCopyMessage('The CSV is selected — press Ctrl+C to copy it.')
      return
    }

    try {
      await navigator.clipboard.writeText(csv)
      setCopyMessage(`Copied ${plural(bookings.length, 'booking')} to the clipboard.`)
    } catch {
      setCopyMessage('Copying was blocked — the CSV is selected, so press Ctrl+C.')
    }
  }

  const apply = async () => {
    setApplying(true)
    setRefusals([])

    const refused: Refusal[] = []
    let added = 0

    // One at a time: each booking is judged against the board including the
    // ones already imported, so two clashing rows cannot both be accepted.
    for (const draft of parsed.rows) {
      const result = await createBooking(draft)
      if (result.ok) {
        added += 1
        continue
      }

      const machine = MACHINES_BY_ID.get(draft.machineId)
      refused.push({
        label: `${machine?.name ?? draft.machineId} · ${formatWeekMinute(draft.startMinute)}`,
        message: result.rejections?.[0]?.message ?? 'The board refused that row.',
      })
    }

    setApplying(false)
    setRefusals(refused)
    setOutcome(
      refused.length === 0
        ? `Imported ${plural(added, 'booking')}.`
        : `Imported ${added} of ${plural(parsed.rows.length, 'row')}; ${refused.length} refused.`,
    )

    audit?.record({
      actorId: member.id,
      action: 'bookings-imported',
      subject: 'CSV',
      details: `${added} of ${plural(parsed.rows.length, 'row')}`,
    })

    notify(
      added > 0
        ? { title: `Imported ${plural(added, 'booking')}`, tone: 'success' }
        : { title: 'Nothing could be imported', tone: 'error' },
    )

    // A clean run has nothing left to fix, so the box is cleared; a partial
    // one keeps the paste so the refused rows can be edited and tried again.
    if (refused.length === 0) setPaste('')
  }

  const hasErrors = parsed.errors.length > 0

  return (
    <div className={styles.root}>
      <header>
        <h1 className={styles.title}>Data</h1>
        <p className={styles.subtitle}>
          Move bookings in and out of the board as CSV — for a backup, a spreadsheet, or another
          workshop.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="export-heading">
        <h2 id="export-heading" className={styles.cardHeading}>
          Export
        </h2>

        <label className={styles.label} htmlFor="export-csv">
          Bookings as CSV
        </label>
        <textarea
          id="export-csv"
          ref={exportRef}
          className={styles.textarea}
          value={csv}
          readOnly
          rows={8}
          spellCheck={false}
          aria-describedby="export-hint"
        />
        <p id="export-hint" className={styles.hint}>
          {bookings.length === 0
            ? 'Nothing is booked yet, so only the header row is here.'
            : `${plural(bookings.length, 'booking')} on the board. Copy the text and keep it, ` +
              'or paste it back below.'}
        </p>

        <div className={styles.actions}>
          <Button onClick={copy}>Copy CSV</Button>
        </div>

        {/* Named so a screen reader user knows which of the two live regions spoke. */}
        <p className={styles.status} role="status" aria-live="polite" aria-label="Export status">
          {copyMessage}
        </p>
      </section>

      <section className={styles.card} aria-labelledby="import-heading">
        <h2 id="import-heading" className={styles.cardHeading}>
          Import
        </h2>

        <label className={styles.label} htmlFor="import-csv">
          Paste CSV to import
        </label>
        <textarea
          id="import-csv"
          className={styles.textarea}
          value={paste}
          rows={8}
          spellCheck={false}
          placeholder={BOOKING_CSV_HEADER.join(',')}
          aria-describedby="import-hint import-errors"
          aria-invalid={hasErrors || undefined}
          onChange={(event) => {
            setPaste(event.target.value)
            setOutcome('')
            setRefusals([])
          }}
        />
        <p id="import-hint" className={styles.hint}>
          Columns: {BOOKING_CSV_HEADER.join(', ')}. Day names and HH:MM times, in any column order.
        </p>

        <div id="import-errors" className={styles.errors}>
          {hasErrors ? (
            <>
              <h3 className={styles.errorsHeading}>
                {plural(parsed.errors.length, 'row problem')}
              </h3>
              <ul className={styles.errorList}>
                {parsed.errors.map((error, index) => (
                  <li key={`${error.line}-${error.column ?? ''}-${index}`} className={styles.error}>
                    <span aria-hidden="true" className={styles.errorMark}>
                      ✕
                    </span>
                    <span>
                      <span className={styles.errorWhere}>
                        Line {error.line}
                        {error.column ? `, ${error.column}` : ''}:
                      </span>{' '}
                      {error.message}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {parsed.rows.length > 0 ? (
          <table className={styles.table}>
            <caption className={styles.caption}>
              {plural(parsed.rows.length, 'row')} ready to import
            </caption>
            <thead>
              <tr>
                <th scope="col">Machine</th>
                <th scope="col">Member</th>
                <th scope="col">When</th>
                <th scope="col">Length</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {parsed.rows.map((row, index) => (
                <tr key={`${row.machineId}-${row.startMinute}-${index}`}>
                  <th scope="row" className={styles.machineCell}>
                    {MACHINES_BY_ID.get(row.machineId)?.name ?? row.machineId}
                  </th>
                  <td className={styles.muted}>
                    {MEMBERS_BY_ID.get(row.memberId)?.name ?? row.memberId}
                  </td>
                  <td className={styles.when}>
                    {formatWeekMinute(row.startMinute)} – {formatClock(row.endMinute)}
                  </td>
                  <td className={styles.muted}>{formatDuration(durationOf(row))}</td>
                  <td className={styles.muted}>{row.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <div className={styles.actions}>
          <Button
            variant="primary"
            loading={applying}
            disabled={parsed.rows.length === 0 || applying}
            onClick={apply}
          >
            {parsed.rows.length === 0
              ? 'Import bookings'
              : `Import ${plural(parsed.rows.length, 'booking')}`}
          </Button>
        </div>

        <div className={styles.status} role="status" aria-live="polite" aria-label="Import status">
          {outcome ? <p>{outcome}</p> : null}
          {refusals.length > 0 ? (
            <ul className={styles.errorList}>
              {refusals.map((refusal, index) => (
                <li key={`${refusal.label}-${index}`} className={styles.error}>
                  <span aria-hidden="true" className={styles.errorMark}>
                    ✕
                  </span>
                  <span>
                    <span className={styles.errorWhere}>{refusal.label}:</span> {refusal.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  )
}
