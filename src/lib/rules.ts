import { OPENING_HOURS, TICKET_LABELS } from '@/data/workshop'
import {
  durationOf,
  formatDuration,
  isSlotAligned,
  isWithinOpeningHours,
  isWithinWeek,
  overlaps,
  pad,
} from '@/lib/weektime'
import type { Booking, BookingDraft, DayWindow, Machine, Member, Rejection } from '@/types'

export interface RuleContext {
  machine: Machine
  member: Member
  /** Every booking already on the board, for any machine or member. */
  existing: readonly Booking[]
  hours?: readonly DayWindow[]
  /** Set when editing, so a booking does not clash with its own old slot. */
  ignoreBookingId?: string
}

/**
 * Checks a draft against every workshop rule and returns the reasons it
 * cannot be accepted. An empty array means the booking is allowed.
 *
 * Rules are checked in order of how fundamental they are, so the first
 * rejection is the most useful thing to tell the member.
 */
export function findRejections(draft: BookingDraft, context: RuleContext): Rejection[] {
  const { machine, member, existing, hours = OPENING_HOURS, ignoreBookingId } = context
  const rejections: Rejection[] = []
  const duration = durationOf(draft)

  if (machine.outOfService) {
    rejections.push({
      code: 'out-of-service',
      message: `${machine.name} is out of service.`,
    })
  }

  if (machine.requiredTicket && !member.tickets.includes(machine.requiredTicket)) {
    rejections.push({
      code: 'missing-ticket',
      message: `${machine.name} needs the ${TICKET_LABELS[machine.requiredTicket]} sign-off.`,
    })
  }

  if (duration <= 0 || !isSlotAligned(draft.startMinute) || !isSlotAligned(draft.endMinute)) {
    rejections.push({
      code: 'zero-length',
      message: 'Pick a start and end on the half hour, with the end after the start.',
    })

    // Nothing below can be judged meaningfully on a malformed interval.
    return rejections
  }

  if (!isWithinWeek(draft) || !isWithinOpeningHours(draft, hours)) {
    rejections.push({
      code: 'outside-opening-hours',
      message: 'The workshop is closed then, or the slot runs past closing time.',
    })
  }

  if (duration > machine.maxSessionMinutes) {
    rejections.push({
      code: 'too-long',
      message: `${machine.name} is limited to ${formatDuration(machine.maxSessionMinutes)} per booking.`,
    })
  }

  const others = existing.filter((booking) => booking.id !== ignoreBookingId)

  const clashes = others.filter(
    (booking) => booking.machineId === draft.machineId && overlaps(booking, draft),
  )
  if (clashes.length > 0) {
    rejections.push({
      code: 'overlaps-booking',
      message: `${machine.name} is already booked then.`,
      conflictIds: clashes.map((booking) => booking.id),
    })
  }

  // Cool-down only matters when nothing already overlaps; reporting both for
  // the same neighbour would just be noise.
  if (clashes.length === 0 && machine.cooldownMinutes > 0) {
    const padded = pad(draft, machine.cooldownMinutes)
    const tooClose = others.filter(
      (booking) => booking.machineId === draft.machineId && overlaps(booking, padded),
    )

    if (tooClose.length > 0) {
      rejections.push({
        code: 'ignores-cooldown',
        message: `${machine.name} needs ${formatDuration(machine.cooldownMinutes)} between bookings.`,
        conflictIds: tooClose.map((booking) => booking.id),
      })
    }
  }

  const booked = minutesBookedBy(member.id, others)
  if (booked + duration > member.weeklyMinuteAllowance) {
    const left = Math.max(0, member.weeklyMinuteAllowance - booked)
    rejections.push({
      code: 'allowance-exceeded',
      message: `That exceeds your weekly allowance — ${formatDuration(left)} left.`,
    })
  }

  return rejections
}

export function isAllowed(draft: BookingDraft, context: RuleContext): boolean {
  return findRejections(draft, context).length === 0
}

/** Total minutes a member already holds across every machine. */
export function minutesBookedBy(memberId: string, bookings: readonly Booking[]): number {
  return bookings
    .filter((booking) => booking.memberId === memberId)
    .reduce((sum, booking) => sum + durationOf(booking), 0)
}

export interface AllowanceUsage {
  used: number
  allowance: number
  remaining: number
  /** 0–1, clamped, so a full bar never overflows its track. */
  fraction: number
}

export function allowanceUsage(
  member: Member,
  bookings: readonly Booking[],
): AllowanceUsage {
  const used = minutesBookedBy(member.id, bookings)
  const allowance = member.weeklyMinuteAllowance

  return {
    used,
    allowance,
    remaining: Math.max(0, allowance - used),
    fraction: allowance > 0 ? Math.min(1, used / allowance) : 0,
  }
}
