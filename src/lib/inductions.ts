import { INDUCTIONS, type Induction } from '@/data/inductions'
import { MACHINES, TICKET_LABELS } from '@/data/workshop'
import { formatWeekMinute, overlaps } from '@/lib/weektime'
import type { Booking, Machine, Member, Ticket } from '@/types'

/** A seat held by a member on a session. Two of these can never be equal. */
export interface Enrolment {
  inductionId: string
  memberId: string
}

export type EnrolmentBlockCode =
  | 'already-held'
  | 'already-enrolled'
  | 'session-full'
  | 'clashes-booking'

export interface EnrolmentBlock {
  code: EnrolmentBlockCode
  message: string
  /** Ids of the member's bookings that clash, when relevant. */
  conflictIds?: readonly string[]
}

export interface EnrolmentContext {
  induction: Induction
  member: Member
  /** Every seat held on every session, by any member. */
  enrolments: readonly Enrolment[]
  /** The member's own bookings; only theirs can clash with their attendance. */
  bookings?: readonly Booking[]
}

/** Machines this sign-off is the key to. */
export function machinesUnlockedBy(
  ticket: Ticket,
  machines: readonly Machine[] = MACHINES,
): Machine[] {
  return machines.filter((machine) => machine.requiredTicket === ticket)
}

/**
 * Sign-offs the member is missing for the machines they want to use, in the
 * order the machines were given so the list reads predictably. A machine that
 * needs no ticket, or one they already hold, contributes nothing.
 */
export function ticketsNeededFor(
  member: Member,
  machineIds: readonly string[],
  machines: readonly Machine[] = MACHINES,
): Ticket[] {
  const needed: Ticket[] = []

  for (const machineId of machineIds) {
    const machine = machines.find((entry) => entry.id === machineId)
    const ticket = machine?.requiredTicket
    if (!ticket) continue
    if (member.tickets.includes(ticket)) continue
    if (needed.includes(ticket)) continue
    needed.push(ticket)
  }

  return needed
}

/**
 * Sessions that would unlock the machines the member asked about, earliest
 * first. Several sessions can grant the same ticket, and all of them are
 * offered: the member only needs to attend one.
 */
export function inductionsNeededBy(
  member: Member,
  machineIds: readonly string[],
  inductions: readonly Induction[] = INDUCTIONS,
  machines: readonly Machine[] = MACHINES,
): Induction[] {
  const needed = ticketsNeededFor(member, machineIds, machines)

  return inductions
    .filter((induction) => needed.includes(induction.grants))
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute)
}

/** Every session that grants a sign-off the member does not yet hold. */
export function openInductionsFor(
  member: Member,
  inductions: readonly Induction[] = INDUCTIONS,
): Induction[] {
  return inductions
    .filter((induction) => !member.tickets.includes(induction.grants))
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute)
}

export function seatsTaken(inductionId: string, enrolments: readonly Enrolment[]): number {
  return enrolments.filter((enrolment) => enrolment.inductionId === inductionId).length
}

/** Never negative: an over-filled session reads as no seats left, not as -1. */
export function seatsRemaining(
  induction: Induction,
  enrolments: readonly Enrolment[],
): number {
  return Math.max(0, induction.capacity - seatsTaken(induction.id, enrolments))
}

export function isFull(induction: Induction, enrolments: readonly Enrolment[]): boolean {
  return seatsRemaining(induction, enrolments) === 0
}

export function isEnrolled(
  inductionId: string,
  memberId: string,
  enrolments: readonly Enrolment[],
): boolean {
  return enrolments.some(
    (enrolment) => enrolment.inductionId === inductionId && enrolment.memberId === memberId,
  )
}

export function enrolmentsForMember(
  memberId: string,
  enrolments: readonly Enrolment[],
): Enrolment[] {
  return enrolments.filter((enrolment) => enrolment.memberId === memberId)
}

/** 0–1, clamped. A session with no seats at all reads as full rather than NaN. */
export function fillFraction(induction: Induction, enrolments: readonly Enrolment[]): number {
  if (induction.capacity <= 0) return 1
  return Math.min(1, seatsTaken(induction.id, enrolments) / induction.capacity)
}

const NUMBER_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
] as const

/**
 * `Four seats left`. Capacity is stated in words rather than a bare number so
 * a screen reader announces it as prose, and a full session says so outright.
 */
export function seatsInWords(remaining: number): string {
  const safe = Math.max(0, Math.floor(remaining))
  if (safe === 0) return 'No seats left'

  const word = NUMBER_WORDS[safe] ?? String(safe)
  return `${word} seat${safe === 1 ? '' : 's'} left`
}

/**
 * Why the member cannot take a seat, most fundamental reason first. An empty
 * array means enrolment is allowed.
 */
export function enrolmentBlockers(context: EnrolmentContext): EnrolmentBlock[] {
  const { induction, member, enrolments, bookings = [] } = context
  const blockers: EnrolmentBlock[] = []

  if (member.tickets.includes(induction.grants)) {
    blockers.push({
      code: 'already-held',
      message: `You already hold the ${TICKET_LABELS[induction.grants]} sign-off.`,
    })
  }

  if (isEnrolled(induction.id, member.id, enrolments)) {
    blockers.push({
      code: 'already-enrolled',
      message: 'You already have a seat on this session.',
    })

    // Their own seat is counted in the tally, so reporting the session as full
    // would be misleading; withdrawing is the only action left to offer.
    return blockers
  }

  if (isFull(induction, enrolments)) {
    blockers.push({
      code: 'session-full',
      message: `${induction.title} is full — ${induction.capacity} of ${induction.capacity} seats taken.`,
    })
  }

  const clashes = bookings.filter(
    (booking) => booking.memberId === member.id && overlaps(booking, induction),
  )
  if (clashes.length > 0) {
    blockers.push({
      code: 'clashes-booking',
      message: `You are already booked in at ${formatWeekMinute(clashes[0].startMinute)}.`,
      conflictIds: clashes.map((booking) => booking.id),
    })
  }

  return blockers
}

export function canEnrol(context: EnrolmentContext): boolean {
  return enrolmentBlockers(context).length === 0
}

/**
 * The soonest session granting `ticket` that the member could actually join,
 * or undefined when every one of them is blocked.
 */
export function nextJoinableInduction(
  ticket: Ticket,
  member: Member,
  enrolments: readonly Enrolment[],
  bookings: readonly Booking[] = [],
  inductions: readonly Induction[] = INDUCTIONS,
): Induction | undefined {
  return inductions
    .filter((induction) => induction.grants === ticket)
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute)
    .find((induction) => canEnrol({ induction, member, enrolments, bookings }))
}
