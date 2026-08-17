import { MINUTES_PER_WEEK, OPENING_HOURS } from '@/data/workshop'
import { findRejections } from '@/lib/rules'
import { durationOf } from '@/lib/weektime'
import type {
  Booking,
  BookingDraft,
  DayWindow,
  Machine,
  Member,
  Rejection,
  RejectionCode,
} from '@/types'

/**
 * Recurring bookings. The board models one repeating week in minutes from
 * Monday 00:00, so a series is stored once — the slot plus how many weeks it
 * runs for — and expanded on demand into an occurrence per week. Nothing here
 * touches a Date, React, or storage: it is arithmetic over the rules engine.
 */

export type SeriesMode = 'skip-refused' | 'all-or-nothing'

export const SERIES_MODES: readonly SeriesMode[] = ['skip-refused', 'all-or-nothing']

export const SERIES_MODE_LABELS: Readonly<Record<SeriesMode, string>> = {
  'skip-refused': 'Book the weeks that fit, skip the rest',
  'all-or-nothing': 'Book every week or none at all',
}

/** A slot booked more than once, kept as one row the member can cancel whole. */
export interface SeriesDefinition {
  id: string
  machineId: string
  memberId: string
  /** Week-minutes of the slot, repeated in each week of the series. */
  startMinute: number
  endMinute: number
  note: string
  /** How many consecutive weeks the slot repeats for, the first included. */
  repeatCount: number
  mode: SeriesMode
  createdAt: number
}

/** A series that has not been assigned an id yet. */
export type SeriesDraft = Omit<SeriesDefinition, 'id' | 'createdAt'>

export interface SeriesOccurrence {
  id: string
  seriesId: string
  /** 0 is the week currently on the board, 1 the week after it, and so on. */
  weekIndex: number
  draft: BookingDraft
}

export interface OccurrenceOutcome {
  occurrence: SeriesOccurrence
  accepted: boolean
  /** Empty when accepted; otherwise every rule the occurrence breaks. */
  rejections: readonly Rejection[]
}

export interface SeriesPlan {
  seriesId: string
  mode: SeriesMode
  outcomes: readonly OccurrenceOutcome[]
  /** The occurrences the mode would actually book. */
  applied: readonly SeriesOccurrence[]
  /** True when the series is worth writing: at least one occurrence lands. */
  ok: boolean
}

export interface SeriesReason {
  code: RejectionCode
  message: string
  /** How many occurrences were refused for this reason. */
  count: number
}

export interface SeriesSummary {
  total: number
  acceptedCount: number
  refusedCount: number
  /** Accepted occurrences the mode keeps; 0 for a refused all-or-nothing run. */
  bookedCount: number
  reasons: readonly SeriesReason[]
  /** The whole outcome as a sentence, so status is never colour-only. */
  text: string
}

export interface SeriesRuleContext {
  machine: Machine
  member: Member
  /** The board as it stands. It holds one week, so these block week 0 only. */
  existing: readonly Booking[]
  /** Series already committed; their occurrences hold slots in later weeks. */
  otherSeries?: readonly SeriesDefinition[]
  hours?: readonly DayWindow[]
}

/** A member may hold a slot for a term, not forever. */
export const MAX_REPEAT_COUNT = 12
export const MIN_REPEAT_COUNT = 1

/**
 * How many occurrences a definition really produces. Persisted or hand-typed
 * counts are clamped rather than trusted, so a rogue value cannot expand into
 * an unbounded list.
 */
export function occurrenceCount(definition: SeriesDefinition): number {
  const { repeatCount } = definition
  if (!Number.isFinite(repeatCount)) return 0
  return Math.min(MAX_REPEAT_COUNT, Math.max(0, Math.floor(repeatCount)))
}

/** Stable across expansions, so React keys and cancels survive a re-plan. */
export function occurrenceId(seriesId: string, weekIndex: number): string {
  return `${seriesId}#w${weekIndex}`
}

/**
 * The concrete bookings a series stands for. Every occurrence carries the same
 * week-minutes — a weekly repeat lands on the same slot of the week — and is
 * told apart by the week it falls in.
 */
export function expandSeries(definition: SeriesDefinition): SeriesOccurrence[] {
  const count = occurrenceCount(definition)
  const occurrences: SeriesOccurrence[] = []

  for (let weekIndex = 0; weekIndex < count; weekIndex += 1) {
    occurrences.push({
      id: occurrenceId(definition.id, weekIndex),
      seriesId: definition.id,
      weekIndex,
      draft: {
        machineId: definition.machineId,
        memberId: definition.memberId,
        startMinute: definition.startMinute,
        endMinute: definition.endMinute,
        note: definition.note,
      },
    })
  }

  return occurrences
}

/** Minutes from Monday 00:00 of week 0, for ordering across weeks. */
export function absoluteStartMinute(occurrence: SeriesOccurrence): number {
  return occurrence.weekIndex * MINUTES_PER_WEEK + occurrence.draft.startMinute
}

/** Length of one occurrence, or 0 when the slot is malformed. */
export function occurrenceMinutes(definition: SeriesDefinition): number {
  return Math.max(0, durationOf(definition))
}

/** Machine time the whole series asks for. */
export function seriesTotalMinutes(definition: SeriesDefinition): number {
  return occurrenceMinutes(definition) * occurrenceCount(definition)
}

/**
 * An occurrence seen as a booking, so the rules engine can weigh it against
 * the board without knowing that series exist.
 */
export function occurrenceAsBooking(occurrence: SeriesOccurrence): Booking {
  return { ...occurrence.draft, id: occurrence.id, createdAt: 0 }
}

/**
 * What each week already holds. Week 0 is the live board; later weeks are
 * empty apart from occurrences other series have claimed.
 */
function bookingsByWeek(
  seriesId: string,
  existing: readonly Booking[],
  otherSeries: readonly SeriesDefinition[],
): Map<number, Booking[]> {
  const weeks = new Map<number, Booking[]>([[0, [...existing]]])

  for (const other of otherSeries) {
    // A series never clashes with itself: re-planning one already on the board
    // would otherwise report every occurrence as taken.
    if (other.id === seriesId) continue

    for (const occurrence of expandSeries(other)) {
      const week = weeks.get(occurrence.weekIndex)
      if (week) week.push(occurrenceAsBooking(occurrence))
      else weeks.set(occurrence.weekIndex, [occurrenceAsBooking(occurrence)])
    }
  }

  return weeks
}

/**
 * Judges every occurrence against the week it falls in and works out what the
 * series would actually book. `skip-refused` keeps the weeks that fit;
 * `all-or-nothing` books nothing as soon as one week is refused.
 */
export function planSeries(
  definition: SeriesDefinition,
  context: SeriesRuleContext,
): SeriesPlan {
  const { machine, member, existing, otherSeries = [], hours = OPENING_HOURS } = context
  const weeks = bookingsByWeek(definition.id, existing, otherSeries)

  const outcomes = expandSeries(definition).map<OccurrenceOutcome>((occurrence) => {
    const rejections = findRejections(occurrence.draft, {
      machine,
      member,
      existing: weeks.get(occurrence.weekIndex) ?? [],
      hours,
    })

    return { occurrence, accepted: rejections.length === 0, rejections }
  })

  const accepted = outcomes.filter((outcome) => outcome.accepted).map((o) => o.occurrence)
  const refusedCount = outcomes.length - accepted.length
  const applied = definition.mode === 'all-or-nothing' && refusedCount > 0 ? [] : accepted

  return {
    seriesId: definition.id,
    mode: definition.mode,
    outcomes,
    applied,
    ok: applied.length > 0,
  }
}

function weekWord(count: number): string {
  return count === 1 ? '1 week' : `${count} weeks`
}

/** One line per distinct reason, counted, so repeats read as one entry. */
function collectReasons(outcomes: readonly OccurrenceOutcome[]): SeriesReason[] {
  const byCode = new Map<RejectionCode, SeriesReason>()

  for (const outcome of outcomes) {
    for (const rejection of outcome.rejections) {
      const seen = byCode.get(rejection.code)
      if (seen) seen.count += 1
      else byCode.set(rejection.code, { code: rejection.code, message: rejection.message, count: 1 })
    }
  }

  return [...byCode.values()]
}

/**
 * Counts and a sentence describing the plan. The sentence is what the dialog
 * announces, so the outcome reaches a screen reader as words rather than as a
 * colour on a list of weeks.
 */
export function summariseSeries(plan: SeriesPlan): SeriesSummary {
  const total = plan.outcomes.length
  const acceptedCount = plan.outcomes.filter((outcome) => outcome.accepted).length
  const refusedCount = total - acceptedCount
  const reasons = collectReasons(plan.outcomes)

  return {
    total,
    acceptedCount,
    refusedCount,
    bookedCount: plan.applied.length,
    reasons,
    text: summaryText(plan.mode, total, acceptedCount, refusedCount),
  }
}

function summaryText(
  mode: SeriesMode,
  total: number,
  acceptedCount: number,
  refusedCount: number,
): string {
  if (total === 0) return 'No weeks to book — choose how often the slot repeats.'

  if (mode === 'all-or-nothing' && refusedCount > 0) {
    return `Nothing will be booked: ${weekWord(refusedCount)} of ${total} refused.`
  }

  if (refusedCount === 0) {
    return total === 1 ? 'That week can be booked.' : `All ${total} weeks can be booked.`
  }

  if (acceptedCount === 0) return `None of the ${weekWord(total)} can be booked.`

  return `${acceptedCount} of ${weekWord(total)} can be booked, ${refusedCount} refused.`
}

/**
 * The next free `sr-NNNN` id. Derived from the ids already taken rather than
 * from a clock or a counter, so the same board always yields the same id.
 */
export function makeSeriesId(takenIds: readonly string[]): string {
  const taken = new Set(takenIds)

  for (let n = 1; ; n += 1) {
    const id = `sr-${String(n).padStart(4, '0')}`
    if (!taken.has(id)) return id
  }
}
