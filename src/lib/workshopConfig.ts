import {
  DAY_NAMES,
  MACHINES,
  MEMBERS,
  MINUTES_PER_DAY,
  OPENING_HOURS,
  SLOT_MINUTES,
} from '@/data/workshop'
import type { DayWindow, Machine, Member, MembershipTier, Ticket } from '@/types'

/**
 * Workshop administration works on overrides, not on copies. The fixtures in
 * `@/data/workshop` stay the defaults, and a keyholder's edits are stored as a
 * sparse patch layered on top of them. A machine nobody has touched therefore
 * keeps following the shipped fixture, and "reset" is just dropping the patch.
 *
 * Everything here is integer minutes and framework free, so the rules can be
 * unit tested without a DOM.
 */

/** Where the persisted override set lives. */
export const CONFIG_STORAGE_KEY = 'benchclock:config:v1'

export interface MachineOverride {
  name?: string
  requiredTicket?: Ticket | null
  maxSessionMinutes?: number
  cooldownMinutes?: number
  location?: string
  outOfService?: boolean
}

export interface MemberOverride {
  name?: string
  tier?: MembershipTier
  tickets?: readonly Ticket[]
  weeklyMinuteAllowance?: number
}

/**
 * A day's edited opening window. The times are kept even while `closed` is
 * true, so re-opening a day restores the window the keyholder last chose
 * instead of making them type it again.
 */
export interface DayOverride {
  closed: boolean
  openMinute: number
  closeMinute: number
}

export interface WorkshopOverrides {
  machines: Readonly<Record<string, MachineOverride>>
  members: Readonly<Record<string, MemberOverride>>
  /** Keyed by day index as a string ('0' = Monday), because JSON has no numeric keys. */
  days: Readonly<Record<string, DayOverride>>
}

export const EMPTY_OVERRIDES: WorkshopOverrides = Object.freeze({
  machines: Object.freeze({}),
  members: Object.freeze({}),
  days: Object.freeze({}),
})

/** The editable fields of a machine; kind and code are not administered here. */
export interface MachineDraft {
  name: string
  requiredTicket: Ticket | null
  maxSessionMinutes: number
  cooldownMinutes: number
  location: string
  outOfService: boolean
}

export interface MemberDraft {
  name: string
  tier: MembershipTier
  tickets: readonly Ticket[]
  weeklyMinuteAllowance: number
}

export interface DayDraft {
  /** 0 = Monday … 6 = Sunday. */
  day: number
  closed: boolean
  openMinute: number
  closeMinute: number
}

export type ConfigField =
  | 'name'
  | 'requiredTicket'
  | 'maxSessionMinutes'
  | 'cooldownMinutes'
  | 'location'
  | 'tier'
  | 'weeklyMinuteAllowance'
  | 'openMinute'
  | 'closeMinute'

export type ConfigErrorCode =
  | 'name-required'
  | 'session-invalid'
  | 'session-not-positive'
  | 'session-not-aligned'
  | 'cooldown-invalid'
  | 'cooldown-negative'
  | 'allowance-invalid'
  | 'allowance-negative'
  | 'window-invalid'
  | 'window-order'
  | 'window-outside-day'

export interface ConfigError {
  code: ConfigErrorCode
  /** Which input the message belongs beside, for `aria-describedby`. */
  field: ConfigField
  message: string
  /** Set on opening-hour errors so a row can show only its own. */
  day?: number
}

export interface WorkshopBase {
  machines: readonly Machine[]
  members: readonly Member[]
  hours: readonly DayWindow[]
}

/** The shipped workshop, used whenever a caller does not supply its own base. */
export const DEFAULT_BASE: WorkshopBase = {
  machines: MACHINES,
  members: MEMBERS,
  hours: OPENING_HOURS,
}

export interface EffectiveWorkshop {
  machines: readonly Machine[]
  members: readonly Member[]
  hours: readonly DayWindow[]
}

const DAYS_IN_WEEK = DAY_NAMES.length

/** A window used to seed the inputs of a day that has never been open. */
const PLACEHOLDER_WINDOW = { openMinute: 17 * 60, closeMinute: 22 * 60 }

function isWholeNumber(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value)
}

/* --------------------------------------------------------------------------
 * Applying overrides
 * ----------------------------------------------------------------------- */

export function effectiveMachines(
  overrides: WorkshopOverrides,
  base: readonly Machine[] = DEFAULT_BASE.machines,
): Machine[] {
  return base.map((machine) => {
    const override = overrides.machines[machine.id]
    return override ? { ...machine, ...override } : { ...machine }
  })
}

export function effectiveMembers(
  overrides: WorkshopOverrides,
  base: readonly Member[] = DEFAULT_BASE.members,
): Member[] {
  return base.map((member) => {
    const override = overrides.members[member.id]
    return override ? { ...member, ...override } : { ...member }
  })
}

/**
 * Opening hours for the whole week. A closed day is left out of the list
 * entirely, which is exactly how `windowFor` in weektime already reads "shut".
 */
export function effectiveOpeningHours(
  overrides: WorkshopOverrides,
  base: readonly DayWindow[] = DEFAULT_BASE.hours,
): DayWindow[] {
  const hours: DayWindow[] = []

  for (let day = 0; day < DAYS_IN_WEEK; day += 1) {
    const override = overrides.days[String(day)]

    if (override) {
      if (!override.closed) {
        hours.push({ day, openMinute: override.openMinute, closeMinute: override.closeMinute })
      }
      continue
    }

    const window = base.find((entry) => entry.day === day)
    if (window) hours.push({ ...window })
  }

  return hours
}

export function applyOverrides(
  overrides: WorkshopOverrides,
  base: WorkshopBase = DEFAULT_BASE,
): EffectiveWorkshop {
  return {
    machines: effectiveMachines(overrides, base.machines),
    members: effectiveMembers(overrides, base.members),
    hours: effectiveOpeningHours(overrides, base.hours),
  }
}

export function hasOverrides(overrides: WorkshopOverrides): boolean {
  return (
    Object.keys(overrides.machines).length > 0 ||
    Object.keys(overrides.members).length > 0 ||
    Object.keys(overrides.days).length > 0
  )
}

/* --------------------------------------------------------------------------
 * Drafts
 * ----------------------------------------------------------------------- */

export function machineDraftFrom(machine: Machine): MachineDraft {
  return {
    name: machine.name,
    requiredTicket: machine.requiredTicket,
    maxSessionMinutes: machine.maxSessionMinutes,
    cooldownMinutes: machine.cooldownMinutes,
    location: machine.location,
    outOfService: machine.outOfService,
  }
}

export function memberDraftFrom(member: Member): MemberDraft {
  return {
    name: member.name,
    tier: member.tier,
    tickets: member.tickets,
    weeklyMinuteAllowance: member.weeklyMinuteAllowance,
  }
}

/**
 * One draft per day of the week, ready to be bound to inputs. A day that is
 * shut still gets times, taken from the override, then the fixture, then a
 * placeholder — an editor with empty time inputs is far harder to use.
 */
export function dayDraftsFrom(
  overrides: WorkshopOverrides,
  base: readonly DayWindow[] = DEFAULT_BASE.hours,
): DayDraft[] {
  const drafts: DayDraft[] = []

  for (let day = 0; day < DAYS_IN_WEEK; day += 1) {
    const override = overrides.days[String(day)]
    const window = base.find((entry) => entry.day === day)
    const fallback = window ?? PLACEHOLDER_WINDOW

    drafts.push({
      day,
      closed: override ? override.closed : !window,
      openMinute: override ? override.openMinute : fallback.openMinute,
      closeMinute: override ? override.closeMinute : fallback.closeMinute,
    })
  }

  return drafts
}

/* --------------------------------------------------------------------------
 * Validation
 * ----------------------------------------------------------------------- */

export function validateMachineDraft(draft: MachineDraft): ConfigError[] {
  const errors: ConfigError[] = []

  if (draft.name.trim() === '') {
    errors.push({ code: 'name-required', field: 'name', message: 'Give the machine a name.' })
  }

  if (!isWholeNumber(draft.maxSessionMinutes)) {
    errors.push({
      code: 'session-invalid',
      field: 'maxSessionMinutes',
      message: 'Enter the longest session as a whole number of minutes.',
    })
  } else if (draft.maxSessionMinutes <= 0) {
    errors.push({
      code: 'session-not-positive',
      field: 'maxSessionMinutes',
      message: 'The longest session must be more than zero minutes.',
    })
  } else if (draft.maxSessionMinutes % SLOT_MINUTES !== 0) {
    errors.push({
      code: 'session-not-aligned',
      field: 'maxSessionMinutes',
      message: `The longest session must be a multiple of ${SLOT_MINUTES} minutes, because slots are booked in ${SLOT_MINUTES} minute steps.`,
    })
  }

  if (!isWholeNumber(draft.cooldownMinutes)) {
    errors.push({
      code: 'cooldown-invalid',
      field: 'cooldownMinutes',
      message: 'Enter the cool-down as a whole number of minutes.',
    })
  } else if (draft.cooldownMinutes < 0) {
    errors.push({
      code: 'cooldown-negative',
      field: 'cooldownMinutes',
      message: 'The cool-down cannot be negative. Use 0 for no cool-down.',
    })
  }

  return errors
}

export function validateMemberDraft(draft: MemberDraft): ConfigError[] {
  const errors: ConfigError[] = []

  if (draft.name.trim() === '') {
    errors.push({ code: 'name-required', field: 'name', message: 'Give the member a name.' })
  }

  if (!isWholeNumber(draft.weeklyMinuteAllowance)) {
    errors.push({
      code: 'allowance-invalid',
      field: 'weeklyMinuteAllowance',
      message: 'Enter the weekly allowance as a whole number of minutes.',
    })
  } else if (draft.weeklyMinuteAllowance < 0) {
    errors.push({
      code: 'allowance-negative',
      field: 'weeklyMinuteAllowance',
      message: 'The weekly allowance cannot be negative.',
    })
  }

  return errors
}

/**
 * A closed day is always valid: its times are only remembered, never used.
 * An open day must run forwards and stay inside its own day, because the rest
 * of the app assumes a window never crosses midnight.
 */
export function validateDayDraft(draft: DayDraft): ConfigError[] {
  if (draft.closed) return []

  const errors: ConfigError[] = []

  if (!isWholeNumber(draft.openMinute)) {
    errors.push({
      code: 'window-invalid',
      field: 'openMinute',
      day: draft.day,
      message: 'Enter an opening time.',
    })
  }

  if (!isWholeNumber(draft.closeMinute)) {
    errors.push({
      code: 'window-invalid',
      field: 'closeMinute',
      day: draft.day,
      message: 'Enter a closing time.',
    })
  }

  if (errors.length > 0) return errors

  if (draft.openMinute < 0 || draft.closeMinute > MINUTES_PER_DAY) {
    errors.push({
      code: 'window-outside-day',
      field: draft.openMinute < 0 ? 'openMinute' : 'closeMinute',
      day: draft.day,
      message: 'Opening hours must sit inside one day, between 00:00 and 24:00.',
    })
  }

  if (draft.closeMinute <= draft.openMinute) {
    errors.push({
      code: 'window-order',
      field: 'closeMinute',
      day: draft.day,
      message: 'Closing time must be after opening time.',
    })
  }

  return errors
}

/* --------------------------------------------------------------------------
 * Recording edits
 * ----------------------------------------------------------------------- */

function withEntry<T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: T | null,
): Record<string, T> {
  const next = { ...record }
  if (value === null) delete next[key]
  else next[key] = value
  return next
}

/** Only the fields that differ from the fixture, so patches stay minimal. */
function machineDiff(draft: MachineDraft, base: Machine): MachineOverride {
  const override: MachineOverride = {}

  if (draft.name !== base.name) override.name = draft.name
  if (draft.requiredTicket !== base.requiredTicket) override.requiredTicket = draft.requiredTicket
  if (draft.maxSessionMinutes !== base.maxSessionMinutes) {
    override.maxSessionMinutes = draft.maxSessionMinutes
  }
  if (draft.cooldownMinutes !== base.cooldownMinutes) {
    override.cooldownMinutes = draft.cooldownMinutes
  }
  if (draft.location !== base.location) override.location = draft.location
  if (draft.outOfService !== base.outOfService) override.outOfService = draft.outOfService

  return override
}

function memberDiff(draft: MemberDraft, base: Member): MemberOverride {
  const override: MemberOverride = {}

  if (draft.name !== base.name) override.name = draft.name
  if (draft.tier !== base.tier) override.tier = draft.tier
  if (draft.weeklyMinuteAllowance !== base.weeklyMinuteAllowance) {
    override.weeklyMinuteAllowance = draft.weeklyMinuteAllowance
  }

  const sameTickets =
    draft.tickets.length === base.tickets.length &&
    draft.tickets.every((ticket) => base.tickets.includes(ticket))
  if (!sameTickets) override.tickets = [...draft.tickets]

  return override
}

export interface OverrideResult {
  overrides: WorkshopOverrides
  errors: readonly ConfigError[]
}

/**
 * Records a machine edit. Invalid drafts are refused with typed errors and
 * leave the override set untouched; an edit that matches the fixture again
 * drops the patch, so the machine goes back to following the defaults.
 */
export function setMachineOverride(
  overrides: WorkshopOverrides,
  machineId: string,
  draft: MachineDraft,
  base: readonly Machine[] = DEFAULT_BASE.machines,
): OverrideResult {
  const machine = base.find((entry) => entry.id === machineId)
  if (!machine) return { overrides, errors: [] }

  const errors = validateMachineDraft(draft)
  if (errors.length > 0) return { overrides, errors }

  const tidy = { ...draft, name: draft.name.trim(), location: draft.location.trim() }
  const diff = machineDiff(tidy, machine)
  const empty = Object.keys(diff).length === 0

  return {
    overrides: {
      ...overrides,
      machines: withEntry(overrides.machines, machineId, empty ? null : diff),
    },
    errors: [],
  }
}

export function setMemberOverride(
  overrides: WorkshopOverrides,
  memberId: string,
  draft: MemberDraft,
  base: readonly Member[] = DEFAULT_BASE.members,
): OverrideResult {
  const member = base.find((entry) => entry.id === memberId)
  if (!member) return { overrides, errors: [] }

  const errors = validateMemberDraft(draft)
  if (errors.length > 0) return { overrides, errors }

  const diff = memberDiff({ ...draft, name: draft.name.trim() }, member)
  const empty = Object.keys(diff).length === 0

  return {
    overrides: {
      ...overrides,
      members: withEntry(overrides.members, memberId, empty ? null : diff),
    },
    errors: [],
  }
}

export function setDayOverride(
  overrides: WorkshopOverrides,
  draft: DayDraft,
  base: readonly DayWindow[] = DEFAULT_BASE.hours,
): OverrideResult {
  const errors = validateDayDraft(draft)
  if (errors.length > 0) return { overrides, errors }

  const window = base.find((entry) => entry.day === draft.day)
  const matchesBase = window
    ? !draft.closed &&
      draft.openMinute === window.openMinute &&
      draft.closeMinute === window.closeMinute
    : draft.closed

  const next: DayOverride = {
    closed: draft.closed,
    openMinute: draft.openMinute,
    closeMinute: draft.closeMinute,
  }

  return {
    overrides: {
      ...overrides,
      days: withEntry(overrides.days, String(draft.day), matchesBase ? null : next),
    },
    errors: [],
  }
}

export function clearMachineOverride(
  overrides: WorkshopOverrides,
  machineId: string,
): WorkshopOverrides {
  return { ...overrides, machines: withEntry(overrides.machines, machineId, null) }
}

export function clearMemberOverride(
  overrides: WorkshopOverrides,
  memberId: string,
): WorkshopOverrides {
  return { ...overrides, members: withEntry(overrides.members, memberId, null) }
}

export function clearDayOverrides(overrides: WorkshopOverrides): WorkshopOverrides {
  return { ...overrides, days: {} }
}

/* --------------------------------------------------------------------------
 * Clock text
 * ----------------------------------------------------------------------- */

/** `'17:30'` → 1050. Returns null for anything that is not a time of day. */
export function clockToMinutes(text: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text.trim())
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || (hours === 24 && minutes > 0)) return null

  return hours * 60 + minutes
}

/** 1050 → `'17:30'`. Midnight at the end of a day is `'24:00'`, not `'00:00'`. */
export function minutesToClock(minute: number): string {
  const safe = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minute)))
  const hours = String(Math.floor(safe / 60)).padStart(2, '0')
  const minutes = String(safe % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}
