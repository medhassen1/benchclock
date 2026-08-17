import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { MACHINES_BY_ID, OPENING_HOURS, SLOT_MINUTES, TICKET_LABELS } from '@/data/workshop'
import { findRejections } from '@/lib/rules'
import { formatClock, formatDuration, formatWeekMinute } from '@/lib/weektime'
import type { Booking, BookingDraft, Member, Rejection } from '@/types'

import styles from './BookingDialog.module.css'

export interface BookingDialogProps {
  machineId: string
  startMinute: number
  member: Member
  bookings: readonly Booking[]
  saving: boolean
  /** Reasons the last submit was refused by the server. */
  serverRejections: readonly Rejection[]
  onSubmit: (draft: BookingDraft) => void
  onClose: () => void
}

const LENGTH_CHOICES = [30, 60, 90, 120, 180]

export function BookingDialog({
  machineId,
  startMinute,
  member,
  bookings,
  saving,
  serverRejections,
  onSubmit,
  onClose,
}: BookingDialogProps) {
  const machine = MACHINES_BY_ID.get(machineId)
  const [lengthMinutes, setLengthMinutes] = useState(SLOT_MINUTES * 2)
  const [note, setNote] = useState('')

  const draft = useMemo<BookingDraft>(
    () => ({
      machineId,
      memberId: member.id,
      startMinute,
      endMinute: startMinute + lengthMinutes,
      note: note.trim(),
    }),
    [machineId, member.id, startMinute, lengthMinutes, note],
  )

  // Derived during render: the same rules the server will apply, so the
  // member sees the refusal before spending a round trip on it.
  const rejections = useMemo(
    () =>
      machine
        ? findRejections(draft, { machine, member, existing: bookings, hours: OPENING_HOURS })
        : [],
    [draft, machine, member, bookings],
  )

  if (!machine) return null

  const blocked = rejections.length > 0
  const shown = blocked ? rejections : serverRejections

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Book ${machine.name}`}
      description={`${formatWeekMinute(startMinute)} · ${machine.location}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={blocked}
            onClick={() => onSubmit(draft)}
          >
            Confirm booking
          </Button>
        </>
      }
    >
      <div className={styles.meta}>
        <Badge tone="neutral">{machine.code}</Badge>
        <Badge tone="neutral">Max {formatDuration(machine.maxSessionMinutes)}</Badge>
        {machine.cooldownMinutes > 0 ? (
          <Badge tone="neutral">{formatDuration(machine.cooldownMinutes)} cool-down</Badge>
        ) : null}
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
        <div className={styles.lengths}>
          {LENGTH_CHOICES.map((minutes) => (
            <label key={minutes} className={styles.lengthOption}>
              <input
                type="radio"
                name="length"
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
        {formatClock(draft.startMinute)} – {formatClock(draft.endMinute)}
      </p>

      <div className={styles.field}>
        <label htmlFor="booking-note" className={styles.legend}>
          Note <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="booking-note"
          className={styles.input}
          type="text"
          value={note}
          maxLength={80}
          placeholder="What are you making?"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div role="status" aria-live="polite" className={styles.status}>
        {shown.length > 0 ? (
          <ul className={styles.rejections}>
            {shown.map((rejection) => (
              <li key={rejection.code} className={styles.rejection}>
                <span aria-hidden="true" className={styles.rejectionMark}>
                  ✕
                </span>
                {rejection.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.clear}>
            <span aria-hidden="true" className={styles.clearMark}>
              ✓
            </span>
            Slot is free and within your allowance.
          </p>
        )}
      </div>
    </Dialog>
  )
}
