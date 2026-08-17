import { useId, useState, type FormEvent } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MACHINE_KIND_LABELS, SLOT_MINUTES, TICKET_LABELS } from '@/data/workshop'
import { formatDuration } from '@/lib/weektime'
import {
  machineDraftFrom,
  type ConfigError,
  type ConfigField,
  type MachineDraft,
} from '@/lib/workshopConfig'
import type { Machine, Ticket } from '@/types'

import styles from './MachineEditor.module.css'

export interface MachineEditorProps {
  /** The machine as it currently is, overrides already applied. */
  machine: Machine
  /** The shipped machine, so the form can say what has been changed. */
  defaults: Machine
  /** Saves the edit, returning the reasons it was refused. */
  onSave: (draft: MachineDraft) => readonly ConfigError[]
  onReset: () => void
}

const TICKET_OPTIONS = Object.keys(TICKET_LABELS) as Ticket[]

/** Empty and non-numeric text both become NaN, which validation reports. */
function toMinutes(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

function differsFromDefault(machine: Machine, defaults: Machine): boolean {
  const a = machineDraftFrom(machine)
  const b = machineDraftFrom(defaults)
  return (
    a.name !== b.name ||
    a.requiredTicket !== b.requiredTicket ||
    a.maxSessionMinutes !== b.maxSessionMinutes ||
    a.cooldownMinutes !== b.cooldownMinutes ||
    a.location !== b.location ||
    a.outOfService !== b.outOfService
  )
}

/**
 * Edits one machine's bookable settings. Validation is owned by
 * `workshopConfig`, and every message it returns is tied to its input through
 * `aria-describedby`, so a screen reader hears the reason on the field itself
 * rather than only in a summary somewhere else on the page.
 */
export function MachineEditor({ machine, defaults, onSave, onReset }: MachineEditorProps) {
  const fieldId = useId()
  const [name, setName] = useState(machine.name)
  const [ticket, setTicket] = useState<Ticket | 'none'>(machine.requiredTicket ?? 'none')
  const [maxSession, setMaxSession] = useState(String(machine.maxSessionMinutes))
  const [cooldown, setCooldown] = useState(String(machine.cooldownMinutes))
  const [location, setLocation] = useState(machine.location)
  const [outOfService, setOutOfService] = useState(machine.outOfService)
  const [errors, setErrors] = useState<readonly ConfigError[]>([])
  const [saved, setSaved] = useState(false)

  const errorFor = (field: ConfigField) => errors.find((error) => error.field === field)

  /** Ties an input to its hint and, when present, to its error message. */
  const describedBy = (field: ConfigField, hint?: string) =>
    [hint, errorFor(field) ? `${fieldId}-${field}-error` : null].filter(Boolean).join(' ') ||
    undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const draft: MachineDraft = {
      name,
      requiredTicket: ticket === 'none' ? null : ticket,
      maxSessionMinutes: toMinutes(maxSession),
      cooldownMinutes: toMinutes(cooldown),
      location,
      outOfService,
    }

    const refused = onSave(draft)
    setErrors(refused)
    setSaved(refused.length === 0)
  }

  const restore = () => {
    onReset()
    setName(defaults.name)
    setTicket(defaults.requiredTicket ?? 'none')
    setMaxSession(String(defaults.maxSessionMinutes))
    setCooldown(String(defaults.cooldownMinutes))
    setLocation(defaults.location)
    setOutOfService(defaults.outOfService)
    setErrors([])
    setSaved(false)
  }

  const changed = differsFromDefault(machine, defaults)

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${fieldId}-heading`}>
      <header className={styles.header}>
        <h3 id={`${fieldId}-heading`} className={styles.heading}>
          {machine.name}
        </h3>
        <div className={styles.tags}>
          <Badge tone="neutral">{MACHINE_KIND_LABELS[machine.kind]}</Badge>
          <Badge tone="neutral">{machine.code}</Badge>
          {changed ? (
            <Badge tone="warn" icon="●">
              Changed from the default
            </Badge>
          ) : (
            <Badge tone="neutral">Default settings</Badge>
          )}
        </div>
      </header>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${fieldId}-name`}>
          Machine name
        </label>
        <input
          id={`${fieldId}-name`}
          className={styles.input}
          type="text"
          value={name}
          aria-invalid={errorFor('name') ? true : undefined}
          aria-describedby={describedBy('name')}
          onChange={(event) => {
            setName(event.target.value)
            setSaved(false)
          }}
        />
        {errorFor('name') ? (
          <p id={`${fieldId}-name-error`} className={styles.error} role="alert">
            <span aria-hidden="true">✕</span> {errorFor('name')?.message}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${fieldId}-ticket`}>
          Required sign-off
        </label>
        <select
          id={`${fieldId}-ticket`}
          className={styles.input}
          value={ticket}
          aria-describedby={`${fieldId}-ticket-hint`}
          onChange={(event) => {
            setTicket(event.target.value as Ticket | 'none')
            setSaved(false)
          }}
        >
          <option value="none">No sign-off needed</option>
          {TICKET_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {TICKET_LABELS[option]}
            </option>
          ))}
        </select>
        <p id={`${fieldId}-ticket-hint`} className={styles.hint}>
          Members without this sign-off cannot book the machine.
        </p>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-maxSessionMinutes`}>
            Longest booking (minutes)
          </label>
          <input
            id={`${fieldId}-maxSessionMinutes`}
            className={styles.input}
            type="text"
            inputMode="numeric"
            value={maxSession}
            aria-invalid={errorFor('maxSessionMinutes') ? true : undefined}
            aria-describedby={describedBy('maxSessionMinutes', `${fieldId}-session-hint`)}
            onChange={(event) => {
              setMaxSession(event.target.value)
              setSaved(false)
            }}
          />
          <p id={`${fieldId}-session-hint`} className={styles.hint}>
            Whole multiples of {SLOT_MINUTES} minutes, the length of one slot. Currently{' '}
            {formatDuration(machine.maxSessionMinutes)}.
          </p>
          {errorFor('maxSessionMinutes') ? (
            <p id={`${fieldId}-maxSessionMinutes-error`} className={styles.error} role="alert">
              <span aria-hidden="true">✕</span> {errorFor('maxSessionMinutes')?.message}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-cooldownMinutes`}>
            Cool-down (minutes)
          </label>
          <input
            id={`${fieldId}-cooldownMinutes`}
            className={styles.input}
            type="text"
            inputMode="numeric"
            value={cooldown}
            aria-invalid={errorFor('cooldownMinutes') ? true : undefined}
            aria-describedby={describedBy('cooldownMinutes', `${fieldId}-cooldown-hint`)}
            onChange={(event) => {
              setCooldown(event.target.value)
              setSaved(false)
            }}
          />
          <p id={`${fieldId}-cooldown-hint`} className={styles.hint}>
            Rest needed between bookings. Use 0 for none.
          </p>
          {errorFor('cooldownMinutes') ? (
            <p id={`${fieldId}-cooldownMinutes-error`} className={styles.error} role="alert">
              <span aria-hidden="true">✕</span> {errorFor('cooldownMinutes')?.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${fieldId}-location`}>
          Location
        </label>
        <input
          id={`${fieldId}-location`}
          className={styles.input}
          type="text"
          value={location}
          onChange={(event) => {
            setLocation(event.target.value)
            setSaved(false)
          }}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={outOfService}
            onChange={(event) => {
              setOutOfService(event.target.checked)
              setSaved(false)
            }}
          />
          Out of service
        </label>
        {/* The badge colour repeats what this sentence already says. */}
        <p className={styles.hint}>
          {outOfService
            ? 'Out of service: nobody can book this machine.'
            : 'In service: members with the right sign-off can book it.'}
        </p>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary">
          Save machine
        </Button>
        <Button onClick={restore} disabled={!changed}>
          Restore defaults
        </Button>
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        {saved ? (
          <span className={styles.saved}>
            <span aria-hidden="true">✓</span> Saved. {machine.name} follows the new settings from
            now on.
          </span>
        ) : null}
      </div>
    </form>
  )
}
