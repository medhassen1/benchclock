import { DAY_NAMES, MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'

/**
 * The audit trail is append-only: entries are never edited, only added and
 * eventually trimmed. Everything here is pure, so the trail can be replayed,
 * filtered, and grouped in a test without a provider or a clock.
 */

export const AUDIT_STORAGE_KEY = 'benchclock:audit:v1'

/** Beyond this the trail is scrollback nobody reads, and storage a member pays for. */
export const MAX_AUDIT_ENTRIES = 200

export const AUDIT_ACTIONS = [
  'booking-created',
  'booking-moved',
  'booking-cancelled',
  'bookings-imported',
  'bookings-exported',
  'member-switched',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  'booking-created': 'Booked',
  'booking-moved': 'Moved',
  'booking-cancelled': 'Cancelled',
  'bookings-imported': 'Imported',
  'bookings-exported': 'Exported',
  'member-switched': 'Signed in',
}

export interface AuditEntry {
  id: string
  /** Member id of whoever performed the action. */
  actorId: string
  action: AuditAction
  /** What was acted on: a machine id, a member id, or a free-form label. */
  subject: string
  /** Human detail for the sentence, such as the slot that was booked. */
  details: string
  /** Epoch milliseconds. Bookings use week minutes; only the trail needs a wall clock. */
  at: number
}

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE

const AUDIT_ID_PREFIX = 'au-'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export function isAuditAction(raw: unknown): raw is AuditAction {
  return typeof raw === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(raw)
}

export function isAuditEntry(raw: unknown): raw is AuditEntry {
  if (typeof raw !== 'object' || raw === null) return false
  const v = raw as Record<string, unknown>

  return (
    typeof v.id === 'string' &&
    typeof v.actorId === 'string' &&
    isAuditAction(v.action) &&
    typeof v.subject === 'string' &&
    typeof v.details === 'string' &&
    typeof v.at === 'number' &&
    Number.isFinite(v.at)
  )
}

/** `au-0007` → 7, and anything unrecognised → 0. */
export function auditSequenceOf(id: string): number {
  if (!id.startsWith(AUDIT_ID_PREFIX)) return 0
  const value = Number(id.slice(AUDIT_ID_PREFIX.length))
  return Number.isInteger(value) && value > 0 ? value : 0
}

/** Zero-padded so ids sort the same way lexicographically and numerically. */
export function formatAuditId(sequence: number): string {
  return `${AUDIT_ID_PREFIX}${String(sequence).padStart(4, '0')}`
}

/** The highest sequence already used, so a reload cannot reissue an id. */
export function highestAuditSequence(entries: readonly AuditEntry[]): number {
  return entries.reduce((highest, entry) => Math.max(highest, auditSequenceOf(entry.id)), 0)
}

/**
 * Newest first. Two entries recorded in the same millisecond are ordered by
 * id, descending: ids only ever increase, so that is still the later one, and
 * the result never depends on the order the array happened to be in.
 */
export function compareAuditEntries(a: AuditEntry, b: AuditEntry): number {
  if (a.at !== b.at) return b.at - a.at
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

export function sortAuditEntries(entries: readonly AuditEntry[]): AuditEntry[] {
  return [...entries].sort(compareAuditEntries)
}

/**
 * Appends an entry and trims the oldest until the trail fits `limit`. The
 * stored array stays in the order it was written, so trimming is a slice from
 * the front rather than a re-sort.
 */
export function appendAuditEntry(
  entries: readonly AuditEntry[],
  entry: AuditEntry,
  limit: number = MAX_AUDIT_ENTRIES,
): AuditEntry[] {
  const next = [...entries, entry]
  return next.length > limit ? next.slice(next.length - limit) : next
}

export interface AuditFilter {
  actorId?: string
  /** A single action, or omitted for every action. */
  action?: AuditAction
  subject?: string
}

/** Filters, then sorts, so callers always get the same order for the same set. */
export function filterAuditEntries(
  entries: readonly AuditEntry[],
  filter: AuditFilter = {},
): AuditEntry[] {
  const matching = entries.filter(
    (entry) =>
      (filter.actorId === undefined || entry.actorId === filter.actorId) &&
      (filter.action === undefined || entry.action === filter.action) &&
      (filter.subject === undefined || entry.subject === filter.subject),
  )

  return sortAuditEntries(matching)
}

/** Whole days since the epoch, floored so timestamps before it still work. */
export function epochDay(at: number): number {
  return Math.floor(at / MS_PER_DAY)
}

/**
 * `2026-08-17`, in UTC.
 *
 * Howard Hinnant's civil-from-days, using integer arithmetic only. A `Date`
 * would put the grouping at the mercy of the machine's timezone, which would
 * make the same trail group differently for two members of the same workshop.
 */
export function formatDayKey(at: number): string {
  const shifted = epochDay(at) + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPosition = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPosition + 2) / 5) + 1
  const month = monthPosition + (monthPosition < 10 ? 3 : -9)
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 0 = Monday, matching `DAY_NAMES`. 1 January 1970 was a Thursday. */
export function weekdayOf(at: number): number {
  return (((epochDay(at) + 3) % 7) + 7) % 7
}

/** `Monday 17 August 2026`. */
export function formatDayLabel(at: number): string {
  const [year, month, day] = formatDayKey(at).split('-')
  const monthName = MONTH_NAMES[Number(month) - 1]
  return `${DAY_NAMES[weekdayOf(at)]} ${Number(day)} ${monthName} ${year}`
}

/** `18:04`, in UTC for the same reason the day key is. */
export function formatAuditTime(at: number): string {
  const inDay = ((at % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY
  const minutes = Math.floor(inDay / MS_PER_MINUTE)
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0')
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`
}

const PHRASES: Readonly<Record<AuditAction, (subject: string) => string>> = {
  'booking-created': (subject) => `booked ${subject}`,
  'booking-moved': (subject) => `moved a booking on ${subject}`,
  'booking-cancelled': (subject) => `cancelled a booking on ${subject}`,
  'bookings-imported': (subject) => `imported bookings from ${subject}`,
  'bookings-exported': (subject) => `exported bookings as ${subject}`,
  'member-switched': (subject) => `signed in as ${subject}`,
}

/** A machine id, a member id, or the raw subject when it is neither. */
export function describeAuditSubject(subject: string): string {
  return MACHINES_BY_ID.get(subject)?.name ?? MEMBERS_BY_ID.get(subject)?.name ?? subject
}

/**
 * One entry as a sentence a member can read: `Ilra Diagana booked Big laser —
 * Mon 18:00 – 19:00`. Ids are resolved to names where the roster still knows
 * them, and left as-is where it does not, so an entry about a retired machine
 * is still legible.
 */
export function formatAuditEntry(entry: AuditEntry): string {
  const actor = MEMBERS_BY_ID.get(entry.actorId)?.name ?? entry.actorId
  const sentence = `${actor} ${PHRASES[entry.action](describeAuditSubject(entry.subject))}`
  const details = entry.details.trim()

  return details === '' ? sentence : `${sentence} — ${details}`
}

export interface AuditDayGroup {
  /** `2026-08-17`; stable and sortable. */
  key: string
  label: string
  entries: AuditEntry[]
}

/** Newest day first, and newest entry first inside each day. */
export function groupAuditEntriesByDay(entries: readonly AuditEntry[]): AuditDayGroup[] {
  const groups = new Map<string, AuditDayGroup>()

  for (const entry of sortAuditEntries(entries)) {
    const key = formatDayKey(entry.at)
    const group = groups.get(key)

    if (group) group.entries.push(entry)
    else groups.set(key, { key, label: formatDayLabel(entry.at), entries: [entry] })
  }

  // Insertion order already follows the sort, but sorting the keys keeps the
  // result correct even if that ever stops being true.
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
}
