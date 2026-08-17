import { DAY_NAMES, MINUTES_PER_DAY, MINUTES_PER_WEEK, SLOT_MINUTES } from '@/data/workshop'
import type { DayWindow } from '@/types'

/**
 * Times are minutes from Monday 00:00. Every helper here is integer-only, so
 * nothing in the app depends on a Date, a timezone, or the current clock.
 */

export interface Interval {
  startMinute: number
  endMinute: number
}

export function dayOf(minute: number): number {
  return Math.floor(minute / MINUTES_PER_DAY)
}

export function minuteOfDay(minute: number): number {
  return minute % MINUTES_PER_DAY
}

export function weekMinute(day: number, minuteOfDay: number): number {
  return day * MINUTES_PER_DAY + minuteOfDay
}

/** `Mon 17:30`. */
export function formatWeekMinute(minute: number): string {
  return `${DAY_NAMES[dayOf(minute)].slice(0, 3)} ${formatClock(minute)}`
}

/** `17:30`, ignoring which day the minute falls on. */
export function formatClock(minute: number): string {
  const inDay = minuteOfDay(minute)
  const hours = String(Math.floor(inDay / 60)).padStart(2, '0')
  const minutes = String(inDay % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** `2 h 30 m`, `45 m`, `3 h`. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const rest = safe % 60

  if (hours === 0) return `${rest} m`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} m`
}

/**
 * True when the two intervals share any minute. Touching end-to-start does
 * not overlap: a booking ending at 18:00 and one starting at 18:00 are fine.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute
}

/** Minutes shared by both intervals; 0 when they merely touch. */
export function overlapMinutes(a: Interval, b: Interval): number {
  return Math.max(
    0,
    Math.min(a.endMinute, b.endMinute) - Math.max(a.startMinute, b.startMinute),
  )
}

/** Grows an interval by `minutes` on both sides, used for cool-down checks. */
export function pad(interval: Interval, minutes: number): Interval {
  return {
    startMinute: interval.startMinute - minutes,
    endMinute: interval.endMinute + minutes,
  }
}

export function durationOf(interval: Interval): number {
  return interval.endMinute - interval.startMinute
}

/** Rounds down to the nearest bookable slot boundary. */
export function floorToSlot(minute: number): number {
  return Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES
}

export function ceilToSlot(minute: number): number {
  return Math.ceil(minute / SLOT_MINUTES) * SLOT_MINUTES
}

export function isSlotAligned(minute: number): boolean {
  return Number.isInteger(minute) && minute % SLOT_MINUTES === 0
}

export function isWithinWeek(interval: Interval): boolean {
  return interval.startMinute >= 0 && interval.endMinute <= MINUTES_PER_WEEK
}

/**
 * The opening window covering `minute`, or undefined when the workshop is
 * shut. A window never spans midnight, so the day alone identifies it.
 */
export function windowFor(
  minute: number,
  hours: readonly DayWindow[],
): DayWindow | undefined {
  const day = dayOf(minute)
  const inDay = minuteOfDay(minute)
  return hours.find(
    (window) => window.day === day && inDay >= window.openMinute && inDay < window.closeMinute,
  )
}

/**
 * True when the whole interval sits inside a single opening window. Bookings
 * may not run past closing or straddle two days.
 */
export function isWithinOpeningHours(
  interval: Interval,
  hours: readonly DayWindow[],
): boolean {
  if (durationOf(interval) <= 0) return false

  const window = windowFor(interval.startMinute, hours)
  if (!window) return false

  const dayStart = window.day * MINUTES_PER_DAY
  return (
    interval.startMinute >= dayStart + window.openMinute &&
    interval.endMinute <= dayStart + window.closeMinute
  )
}

/** Every bookable slot start in a day's opening window. */
export function slotsForDay(day: number, hours: readonly DayWindow[]): number[] {
  const window = hours.find((entry) => entry.day === day)
  if (!window) return []

  const slots: number[] = []
  const dayStart = day * MINUTES_PER_DAY
  for (let m = window.openMinute; m + SLOT_MINUTES <= window.closeMinute; m += SLOT_MINUTES) {
    slots.push(dayStart + m)
  }
  return slots
}

/** Sums the durations of a set of intervals. */
export function totalMinutes(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, interval) => sum + durationOf(interval), 0)
}
