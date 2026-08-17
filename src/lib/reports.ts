import {
  DAY_NAMES,
  MACHINES,
  MEMBERS,
  MINUTES_PER_DAY,
  OPENING_HOURS,
  SLOT_MINUTES,
} from '@/data/workshop'
import { allowanceUsage } from '@/lib/rules'
import { durationOf, overlapMinutes, slotsForDay, type Interval } from '@/lib/weektime'
import type { Booking, DayWindow, Machine, Member } from '@/types'

/**
 * Reporting maths over a week of bookings.
 *
 * Everything here is integer-minute arithmetic on plain data: no Date, no
 * clock, no React. That keeps a report reproducible — the same bookings always
 * produce the same numbers — and lets the page below it stay presentational.
 *
 * Every ratio is guarded against a zero denominator, because a closed
 * workshop, an out-of-service machine or an empty week are all normal states
 * and none of them may surface as NaN in the interface.
 */

export type TrendDirection = 'up' | 'down' | 'flat'

export interface ReportOptions {
  machines?: readonly Machine[]
  members?: readonly Member[]
  hours?: readonly DayWindow[]
}

/** Safe division: a zero or negative denominator reports as 0, never NaN. */
function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.max(0, Math.min(1, part / whole))
}

/** The absolute week interval an opening window covers. */
function windowInterval(window: DayWindow): Interval {
  return {
    startMinute: window.day * MINUTES_PER_DAY + window.openMinute,
    endMinute: window.day * MINUTES_PER_DAY + window.closeMinute,
  }
}

/** `0%`–`100%`, rounded, with non-finite input treated as nothing booked. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '0%'
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`
}

/** Minutes the workshop is open across the whole week. */
export function openMinutes(hours: readonly DayWindow[] = OPENING_HOURS): number {
  return hours.reduce(
    (sum, window) => sum + Math.max(0, window.closeMinute - window.openMinute),
    0,
  )
}

/**
 * Minutes of an interval that fall inside opening hours.
 *
 * Bookings are validated when they are made, but seeded or hand-edited data
 * can sit partly outside opening hours, and counting those minutes would push
 * utilisation past 100% for a machine nobody could actually book.
 */
export function bookedMinutesInHours(
  interval: Interval,
  hours: readonly DayWindow[] = OPENING_HOURS,
): number {
  return hours.reduce((sum, window) => sum + overlapMinutes(interval, windowInterval(window)), 0)
}

/**
 * Minutes a single machine could be booked for in a week. A machine that is
 * out of service offers none, which is the zero-denominator case the ratios
 * above are guarded for.
 */
export function bookableMinutesFor(
  machine: Machine,
  hours: readonly DayWindow[] = OPENING_HOURS,
): number {
  return machine.outOfService ? 0 : openMinutes(hours)
}

export interface MachineUtilisation {
  machine: Machine
  /** Bookings touching this machine, whole ones, not clipped. */
  bookings: number
  /** Booked minutes counted only inside opening hours. */
  bookedMinutes: number
  bookableMinutes: number
  /** 0–1, clamped; 0 when nothing is bookable. */
  fraction: number
}

/** Utilisation per machine, busiest first. */
export function machineUtilisation(
  bookings: readonly Booking[],
  options: ReportOptions = {},
): MachineUtilisation[] {
  const { machines = MACHINES, hours = OPENING_HOURS } = options

  return machines
    .map((machine) => {
      const own = bookings.filter((booking) => booking.machineId === machine.id)
      const bookedMinutes = own.reduce(
        (sum, booking) => sum + bookedMinutesInHours(booking, hours),
        0,
      )
      const bookableMinutes = bookableMinutesFor(machine, hours)

      return {
        machine,
        bookings: own.length,
        bookedMinutes,
        bookableMinutes,
        fraction: ratio(bookedMinutes, bookableMinutes),
      }
    })
    .sort(
      (a, b) =>
        b.fraction - a.fraction ||
        b.bookedMinutes - a.bookedMinutes ||
        a.machine.name.localeCompare(b.machine.name),
    )
}

export interface OccupancyCell {
  day: number
  /** Hour of the day this column covers, 0–23. */
  hour: number
  bookedMinutes: number
  capacityMinutes: number
  fraction: number
  /** False when the workshop is shut for the whole hour. */
  open: boolean
}

export interface OccupancyRow {
  day: number
  cells: OccupancyCell[]
  bookedMinutes: number
  capacityMinutes: number
  fraction: number
}

export interface OccupancyMatrix {
  /** Hour-of-day columns, ascending; empty when the workshop never opens. */
  hours: number[]
  /** One row per day of the week, closed days included. */
  rows: OccupancyRow[]
  bookedMinutes: number
  capacityMinutes: number
  fraction: number
}

/**
 * A day-by-hour grid of how much of the bookable capacity is taken.
 *
 * Columns span only the hours the workshop is ever open, so the heatmap does
 * not waste twenty rows of empty night. Capacity counts every bookable machine
 * for the open part of the hour, which means a half-open hour is measured
 * against the half it was actually open rather than a full one.
 */
export function occupancyMatrix(
  bookings: readonly Booking[],
  options: ReportOptions = {},
): OccupancyMatrix {
  const { machines = MACHINES, hours = OPENING_HOURS } = options

  const bookable = machines.filter((machine) => !machine.outOfService)
  const bookableIds = new Set(bookable.map((machine) => machine.id))
  const counted = bookings.filter((booking) => bookableIds.has(booking.machineId))

  const openWindows = hours.filter((window) => window.closeMinute > window.openMinute)
  const firstHour =
    openWindows.length === 0
      ? 0
      : Math.floor(Math.min(...openWindows.map((window) => window.openMinute)) / 60)
  const lastHour =
    openWindows.length === 0
      ? -1
      : Math.ceil(Math.max(...openWindows.map((window) => window.closeMinute)) / 60) - 1

  const columns: number[] = []
  for (let hour = firstHour; hour <= lastHour; hour += 1) columns.push(hour)

  const rows = DAY_NAMES.map((_name, day) => {
    const dayWindows = openWindows.filter((window) => window.day === day)

    const cells = columns.map((hour) => {
      const cell: Interval = {
        startMinute: day * MINUTES_PER_DAY + hour * 60,
        endMinute: day * MINUTES_PER_DAY + (hour + 1) * 60,
      }

      // Windows within a day never overlap, so summing across them cannot
      // count the same minute twice.
      const openInCell = dayWindows.reduce(
        (sum, window) => sum + overlapMinutes(cell, windowInterval(window)),
        0,
      )
      const capacityMinutes = openInCell * bookable.length

      const bookedMinutes = counted.reduce((sum, booking) => {
        const inCell = dayWindows.reduce((inner, window) => {
          const open = windowInterval(window)
          const clipped: Interval = {
            startMinute: Math.max(cell.startMinute, open.startMinute),
            endMinute: Math.min(cell.endMinute, open.endMinute),
          }
          return inner + overlapMinutes(booking, clipped)
        }, 0)
        return sum + inCell
      }, 0)

      return {
        day,
        hour,
        bookedMinutes,
        capacityMinutes,
        fraction: ratio(bookedMinutes, capacityMinutes),
        open: capacityMinutes > 0,
      }
    })

    const bookedMinutes = cells.reduce((sum, cell) => sum + cell.bookedMinutes, 0)
    const capacityMinutes = cells.reduce((sum, cell) => sum + cell.capacityMinutes, 0)

    return {
      day,
      cells,
      bookedMinutes,
      capacityMinutes,
      fraction: ratio(bookedMinutes, capacityMinutes),
    }
  })

  const bookedMinutes = rows.reduce((sum, row) => sum + row.bookedMinutes, 0)
  const capacityMinutes = rows.reduce((sum, row) => sum + row.capacityMinutes, 0)

  return {
    hours: columns,
    rows,
    bookedMinutes,
    capacityMinutes,
    fraction: ratio(bookedMinutes, capacityMinutes),
  }
}

export interface PeakHour {
  day: number
  hour: number
  bookedMinutes: number
  capacityMinutes: number
  fraction: number
  /**
   * Dense rank. Equally busy hours share a rank, so the table never implies
   * an ordering the numbers do not support.
   */
  rank: number
}

/**
 * The busiest open hours, most contended first. Closed hours are left out
 * entirely: an hour with no capacity is not quiet, it does not exist.
 */
export function peakHours(matrix: OccupancyMatrix, limit = 5): PeakHour[] {
  const open = matrix.rows
    .flatMap((row) => row.cells)
    .filter((cell) => cell.open)
    .sort((a, b) => b.fraction - a.fraction || a.day - b.day || a.hour - b.hour)

  let rank = 0
  let previous = Number.NaN

  const ranked = open.map((cell) => {
    if (cell.fraction !== previous) {
      rank += 1
      previous = cell.fraction
    }
    return {
      day: cell.day,
      hour: cell.hour,
      bookedMinutes: cell.bookedMinutes,
      capacityMinutes: cell.capacityMinutes,
      fraction: cell.fraction,
      rank,
    }
  })

  return ranked.slice(0, Math.max(0, limit))
}

export interface QuietSlot {
  day: number
  startMinute: number
  endMinute: number
  /** Machines booked for any part of the slot. */
  bookedMachines: number
  freeMachines: number
  /** Share of bookable machines taken, 0–1. */
  fraction: number
}

export interface QuietSlotOptions extends ReportOptions {
  limit?: number
}

/**
 * The bookable half-hour slots with the least demand — what to suggest to a
 * member who just wants a quiet bench. Ordered by demand, then chronologically
 * so the earliest of several equally quiet slots comes first.
 */
export function quietSlots(
  bookings: readonly Booking[],
  options: QuietSlotOptions = {},
): QuietSlot[] {
  const { machines = MACHINES, hours = OPENING_HOURS, limit = 5 } = options

  const bookable = machines.filter((machine) => !machine.outOfService)
  const bookableIds = new Set(bookable.map((machine) => machine.id))
  const counted = bookings.filter((booking) => bookableIds.has(booking.machineId))

  const slots: QuietSlot[] = []

  for (let day = 0; day < DAY_NAMES.length; day += 1) {
    for (const startMinute of slotsForDay(day, hours)) {
      const slot: Interval = { startMinute, endMinute: startMinute + SLOT_MINUTES }
      const taken = new Set(
        counted
          .filter((booking) => overlapMinutes(booking, slot) > 0)
          .map((booking) => booking.machineId),
      )

      slots.push({
        day,
        startMinute,
        endMinute: slot.endMinute,
        bookedMachines: taken.size,
        freeMachines: bookable.length - taken.size,
        fraction: ratio(taken.size, bookable.length),
      })
    }
  }

  return slots
    .sort((a, b) => a.fraction - b.fraction || a.startMinute - b.startMinute)
    .slice(0, Math.max(0, limit))
}

export interface MemberStanding {
  member: Member
  bookings: number
  bookedMinutes: number
  allowance: number
  remaining: number
  /** Share of the member's own allowance used, 0–1 clamped. */
  allowanceFraction: number
  /** Share of every booked minute in the week, 0–1; 0 when nobody booked. */
  shareOfWeek: number
  /** Dense rank, so members with identical time share a place. */
  rank: number
}

/**
 * Who booked the most this week, and how much of their allowance that ate.
 *
 * Minutes here are the raw booked duration rather than the part inside
 * opening hours, because that is exactly what the allowance rule charges a
 * member for; clipping would show a figure that disagrees with their meter.
 */
export function memberLeaderboard(
  bookings: readonly Booking[],
  options: ReportOptions = {},
): MemberStanding[] {
  const { members = MEMBERS } = options

  const totals = members.map((member) => {
    const own = bookings.filter((booking) => booking.memberId === member.id)
    const usage = allowanceUsage(member, bookings)

    return {
      member,
      bookings: own.length,
      bookedMinutes: own.reduce((sum, booking) => sum + durationOf(booking), 0),
      allowance: usage.allowance,
      remaining: usage.remaining,
      allowanceFraction: usage.fraction,
    }
  })

  const weekMinutes = totals.reduce((sum, entry) => sum + entry.bookedMinutes, 0)

  let rank = 0
  let previous = Number.NaN

  return totals
    .sort(
      (a, b) => b.bookedMinutes - a.bookedMinutes || a.member.name.localeCompare(b.member.name),
    )
    .map((entry) => {
      if (entry.bookedMinutes !== previous) {
        rank += 1
        previous = entry.bookedMinutes
      }
      return {
        ...entry,
        shareOfWeek: ratio(entry.bookedMinutes, weekMinutes),
        rank,
      }
    })
}

export interface WeekSummary {
  bookingCount: number
  bookedMinutes: number
  bookableMinutes: number
  /** Overall utilisation across every bookable machine, 0–1. */
  fraction: number
  /** Members holding at least one booking. */
  activeMembers: number
  busiest: MachineUtilisation | null
  /** Least booked open day; null when the workshop never opens. */
  quietestDay: OccupancyRow | null
}

/** The headline numbers for the summary tiles. */
export function weekSummary(
  bookings: readonly Booking[],
  options: ReportOptions = {},
): WeekSummary {
  const { machines = MACHINES, hours = OPENING_HOURS } = options

  const perMachine = machineUtilisation(bookings, options)
  const bookedMinutes = perMachine.reduce((sum, entry) => sum + entry.bookedMinutes, 0)
  const bookableMinutes = machines.reduce(
    (sum, machine) => sum + bookableMinutesFor(machine, hours),
    0,
  )

  const openRows = occupancyMatrix(bookings, options).rows.filter((row) => row.capacityMinutes > 0)
  const quietestDay = openRows.reduce<OccupancyRow | null>(
    (quietest, row) => (quietest === null || row.fraction < quietest.fraction ? row : quietest),
    null,
  )

  return {
    bookingCount: bookings.length,
    bookedMinutes,
    bookableMinutes,
    fraction: ratio(bookedMinutes, bookableMinutes),
    activeMembers: new Set(bookings.map((booking) => booking.memberId)).size,
    busiest: perMachine.find((entry) => entry.bookedMinutes > 0) ?? null,
    quietestDay,
  }
}

export interface Delta {
  previous: number
  current: number
  /** Simple difference; for fractions this is a difference of fractions. */
  delta: number
  /**
   * Relative change, or null when the previous value was 0 — growth from
   * nothing has no meaningful percentage and must not render as Infinity.
   */
  changeFraction: number | null
  direction: TrendDirection
}

/** Builds the comparison of one number against its previous-week counterpart. */
export function toDelta(previous: number, current: number): Delta {
  const difference = current - previous

  return {
    previous,
    current,
    delta: difference,
    changeFraction: previous === 0 ? null : difference / previous,
    direction: difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat',
  }
}

export interface MachineDelta {
  machine: Machine
  minutes: Delta
  /** Utilisation share either week, so a small machine is not judged by minutes alone. */
  fraction: Delta
}

export interface WeekComparison {
  bookingCount: Delta
  bookedMinutes: Delta
  activeMembers: Delta
  /** Overall utilisation, as fractions of bookable time. */
  utilisation: Delta
  /** One entry per machine, biggest mover first. */
  machines: MachineDelta[]
}

/**
 * Week-over-week deltas. Either side may be empty — a first week has no
 * previous, and a shut week has no current — so every figure falls back to 0
 * and relative change is reported as null rather than a division by zero.
 */
export function compareWeeks(
  previous: readonly Booking[],
  current: readonly Booking[],
  options: ReportOptions = {},
): WeekComparison {
  const before = weekSummary(previous, options)
  const after = weekSummary(current, options)

  const beforeByMachine = new Map(
    machineUtilisation(previous, options).map((entry) => [entry.machine.id, entry]),
  )
  const afterByMachine = new Map(
    machineUtilisation(current, options).map((entry) => [entry.machine.id, entry]),
  )

  const { machines = MACHINES } = options
  const machineDeltas = machines
    .map((machine) => {
      const beforeEntry = beforeByMachine.get(machine.id)
      const afterEntry = afterByMachine.get(machine.id)

      return {
        machine,
        minutes: toDelta(beforeEntry?.bookedMinutes ?? 0, afterEntry?.bookedMinutes ?? 0),
        fraction: toDelta(beforeEntry?.fraction ?? 0, afterEntry?.fraction ?? 0),
      }
    })
    .sort(
      (a, b) =>
        Math.abs(b.minutes.delta) - Math.abs(a.minutes.delta) ||
        a.machine.name.localeCompare(b.machine.name),
    )

  return {
    bookingCount: toDelta(before.bookingCount, after.bookingCount),
    bookedMinutes: toDelta(before.bookedMinutes, after.bookedMinutes),
    activeMembers: toDelta(before.activeMembers, after.activeMembers),
    utilisation: toDelta(before.fraction, after.fraction),
    machines: machineDeltas,
  }
}
