import { MACHINES_BY_ID, MEMBERS_BY_ID, OPENING_HOURS } from '@/data/workshop'
import { findRejections } from '@/lib/rules'
import { durationOf, isSlotAligned } from '@/lib/weektime'
import type { Booking, BookingDraft, DayWindow, Machine, Member, Rejection } from '@/types'

/**
 * A queue of members waiting for a slot somebody else already holds. When the
 * holder cancels, the first person in the queue who still passes the booking
 * rules takes the slot; anyone ahead of them who no longer qualifies is passed
 * over rather than silently given a booking the rules would refuse.
 *
 * Everything here is integer-only and framework-free, like the rules engine.
 */

/** Waitlist storage lives beside the board's keys, which this module cannot extend. */
export const WAITLIST_STORAGE_KEY = 'benchclock:waitlist:v1'

/** The machine and time span being queued for. */
export interface WaitlistSlot {
  machineId: string
  startMinute: number
  endMinute: number
}

export interface WaitlistEntry extends WaitlistSlot {
  id: string
  memberId: string
  note: string
  /**
   * Join order. A monotonically increasing sequence number rather than a clock
   * reading, so a queue restored from storage orders identically everywhere —
   * the same reason times in this app are plain integers.
   */
  joinedAt: number
}

export interface WaitlistJoinInput extends WaitlistSlot {
  memberId: string
  note?: string
  /** Supplied by tests; otherwise derived from the entries already queued. */
  id?: string
  joinedAt?: number
}

/** Why a join was refused. */
export type JoinRefusal = 'duplicate' | 'malformed-slot'

export type JoinResult =
  | { ok: true; entry: WaitlistEntry; entries: WaitlistEntry[] }
  | { ok: false; reason: JoinRefusal; entries: WaitlistEntry[] }

export interface PromotionContext {
  /** Every booking on the board once the holder's booking is gone. */
  bookings: readonly Booking[]
  machines?: ReadonlyMap<string, Machine>
  members?: ReadonlyMap<string, Member>
  hours?: readonly DayWindow[]
}

export interface SkippedEntry {
  entry: WaitlistEntry
  /** Why they were passed over, in the rules engine's own words. */
  rejections: readonly Rejection[]
}

export interface PromotionOutcome {
  /** The first entry that still qualifies, or null when nobody does. */
  promoted: WaitlistEntry | null
  /** Everyone ahead of the promoted entry who no longer qualifies. */
  skipped: SkippedEntry[]
}

/** Identifies a slot; two entries share a queue when their keys match. */
export function slotKey(slot: WaitlistSlot): string {
  return `${slot.machineId}:${slot.startMinute}:${slot.endMinute}`
}

export function isSameSlot(a: WaitlistSlot, b: WaitlistSlot): boolean {
  return slotKey(a) === slotKey(b)
}

/**
 * FIFO by join order, tie-broken by id. The tie-break is what makes the queue
 * deterministic: two entries created in the same tick must still have one
 * stable order, or positions would shuffle between renders.
 */
export function compareQueue(a: WaitlistEntry, b: WaitlistEntry): number {
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

export function sortQueue(entries: readonly WaitlistEntry[]): WaitlistEntry[] {
  return [...entries].sort(compareQueue)
}

/** The queue for one slot, in the order it will be served. */
export function entriesForSlot(
  entries: readonly WaitlistEntry[],
  slot: WaitlistSlot,
): WaitlistEntry[] {
  return sortQueue(entries.filter((entry) => isSameSlot(entry, slot)))
}

/** Everything one member is waiting for, earliest slot first. */
export function entriesForMember(
  entries: readonly WaitlistEntry[],
  memberId: string,
): WaitlistEntry[] {
  return entries
    .filter((entry) => entry.memberId === memberId)
    .sort((a, b) => a.startMinute - b.startMinute || compareQueue(a, b))
}

/** 1-based place in its own slot's queue; 0 when the entry is not queued. */
export function positionOf(entries: readonly WaitlistEntry[], entryId: string): number {
  const entry = entries.find((candidate) => candidate.id === entryId)
  if (!entry) return 0

  return entriesForSlot(entries, entry).findIndex((queued) => queued.id === entryId) + 1
}

export function queueLength(entries: readonly WaitlistEntry[], slot: WaitlistSlot): number {
  return entries.filter((entry) => isSameSlot(entry, slot)).length
}

export function hasJoined(
  entries: readonly WaitlistEntry[],
  slot: WaitlistSlot,
  memberId: string,
): boolean {
  return entries.some((entry) => entry.memberId === memberId && isSameSlot(entry, slot))
}

/** The member's own entry for a slot, if they are waiting for it. */
export function entryFor(
  entries: readonly WaitlistEntry[],
  slot: WaitlistSlot,
  memberId: string,
): WaitlistEntry | undefined {
  return entries.find((entry) => entry.memberId === memberId && isSameSlot(entry, slot))
}

/** One past the highest sequence number in use, so a new entry joins at the back. */
export function nextJoinedAt(entries: readonly WaitlistEntry[]): number {
  return entries.reduce((highest, entry) => Math.max(highest, entry.joinedAt), 0) + 1
}

/**
 * `wl-0007`, counting on from the highest id in use. Derived from the entries
 * themselves rather than a module-level counter, so a reload continues the
 * sequence instead of minting ids that already exist.
 */
export function nextEntryId(entries: readonly WaitlistEntry[]): string {
  const highest = entries.reduce((max, entry) => {
    const match = /^wl-(\d+)$/.exec(entry.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return `wl-${String(highest + 1).padStart(4, '0')}`
}

/** A slot has to be bookable in principle before anyone may queue for it. */
export function isBookableSlot(slot: WaitlistSlot): boolean {
  return (
    durationOf(slot) > 0 && isSlotAligned(slot.startMinute) && isSlotAligned(slot.endMinute)
  )
}

/**
 * Adds a member to the back of a slot's queue. A member may hold only one
 * place per slot, so a second join is refused rather than queueing them twice
 * and letting them block their own promotion.
 */
export function joinWaitlist(
  entries: readonly WaitlistEntry[],
  input: WaitlistJoinInput,
): JoinResult {
  const kept = [...entries]

  if (!isBookableSlot(input)) {
    return { ok: false, reason: 'malformed-slot', entries: kept }
  }

  if (hasJoined(entries, input, input.memberId)) {
    return { ok: false, reason: 'duplicate', entries: kept }
  }

  const entry: WaitlistEntry = {
    id: input.id ?? nextEntryId(entries),
    machineId: input.machineId,
    memberId: input.memberId,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    note: input.note?.trim() ?? '',
    joinedAt: input.joinedAt ?? nextJoinedAt(entries),
  }

  return { ok: true, entry, entries: [...kept, entry] }
}

/** Removes one entry. Positions behind it close up, since they are derived. */
export function leaveWaitlist(
  entries: readonly WaitlistEntry[],
  entryId: string,
): WaitlistEntry[] {
  return entries.filter((entry) => entry.id !== entryId)
}

export function withoutEntries(
  entries: readonly WaitlistEntry[],
  entryIds: Iterable<string>,
): WaitlistEntry[] {
  const removed = new Set(entryIds)
  return entries.filter((entry) => !removed.has(entry.id))
}

/** The booking a waiting member would get if they were promoted now. */
export function draftFor(entry: WaitlistEntry): BookingDraft {
  return {
    machineId: entry.machineId,
    memberId: entry.memberId,
    startMinute: entry.startMinute,
    endMinute: entry.endMinute,
    note: entry.note,
  }
}

/**
 * The reasons this entry could not be turned into a booking right now. Empty
 * means they qualify. A machine or member that has left the workshop is
 * reported as `out-of-service`: `RejectionCode` is a closed union shared with
 * the rules engine, and that code is the closest honest fit.
 */
export function checkEntry(
  entry: WaitlistEntry,
  context: PromotionContext,
): readonly Rejection[] {
  const {
    bookings,
    machines = MACHINES_BY_ID,
    members = MEMBERS_BY_ID,
    hours = OPENING_HOURS,
  } = context

  const machine = machines.get(entry.machineId)
  const member = members.get(entry.memberId)

  if (!machine || !member) {
    return [
      {
        code: 'out-of-service',
        message: 'That machine or member is no longer in the workshop.',
      },
    ]
  }

  return findRejections(draftFor(entry), { machine, member, existing: bookings, hours })
}

/**
 * Walks the queue for a slot and reports who takes it. Everyone ahead of the
 * winner who no longer qualifies — their sign-off lapsed, their allowance is
 * spent, they booked something else that clashes — is returned as skipped,
 * with the rules' own reasons, so the caller can tell them why.
 */
export function resolvePromotion(
  entries: readonly WaitlistEntry[],
  slot: WaitlistSlot,
  context: PromotionContext,
): PromotionOutcome {
  const skipped: SkippedEntry[] = []

  for (const entry of entriesForSlot(entries, slot)) {
    const rejections = checkEntry(entry, context)
    if (rejections.length === 0) return { promoted: entry, skipped }
    skipped.push({ entry, rejections })
  }

  return { promoted: null, skipped }
}

/** Drops everyone the promotion touched; the rest keep their relative order. */
export function applyPromotion(
  entries: readonly WaitlistEntry[],
  outcome: PromotionOutcome,
): WaitlistEntry[] {
  const ids = outcome.skipped.map((skip) => skip.entry.id)
  if (outcome.promoted) ids.push(outcome.promoted.id)
  return withoutEntries(entries, ids)
}

/** `Position 2 of 4` — the queue's state in words, never colour alone. */
export function formatPosition(position: number, total: number): string {
  return `Position ${position} of ${total}`
}
