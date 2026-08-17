import {
  DUE_SOON_FRACTION,
  MAINTENANCE_WINDOWS,
  SERVICE_INTERVALS_BY_MACHINE,
  type MaintenanceWindow,
  type ServiceInterval,
  type ServiceLogEntry,
} from '@/data/maintenance'
import { dayOf, durationOf, overlaps, type Interval } from '@/lib/weektime'
import type { Booking, Machine, Rejection } from '@/types'

/**
 * Maintenance logic, kept free of React and of the clock. Everything here is
 * integer minutes from Monday 00:00, matching the booking model exactly so a
 * window and a booking can be compared without conversion.
 */

const byStart = (a: MaintenanceWindow, b: MaintenanceWindow) => a.startMinute - b.startMinute

/** A machine's windows, earliest first. */
export function windowsForMachine(
  machineId: string,
  windows: readonly MaintenanceWindow[] = MAINTENANCE_WINDOWS,
): MaintenanceWindow[] {
  return windows.filter((window) => window.machineId === machineId).sort(byStart)
}

/**
 * The windows a draft interval runs into. Touching end-to-start is not a
 * collision — a booking that ends exactly when servicing starts is fine, which
 * is the same rule bookings use against each other.
 */
export function collidingWindows(
  machineId: string,
  interval: Interval,
  windows: readonly MaintenanceWindow[] = MAINTENANCE_WINDOWS,
): MaintenanceWindow[] {
  return windows
    .filter((window) => window.machineId === machineId && overlaps(window, interval))
    .sort(byStart)
}

export function collidesWithMaintenance(
  machineId: string,
  interval: Interval,
  windows: readonly MaintenanceWindow[] = MAINTENANCE_WINDOWS,
): boolean {
  return collidingWindows(machineId, interval, windows).length > 0
}

/**
 * The next window for a machine at or after `fromMinute`. A window already
 * under way still counts as next, because it is what stops a booking now.
 */
export function nextWindowFor(
  machineId: string,
  fromMinute: number,
  windows: readonly MaintenanceWindow[] = MAINTENANCE_WINDOWS,
): MaintenanceWindow | undefined {
  return windowsForMachine(machineId, windows).find((window) => window.endMinute > fromMinute)
}

export function groupWindowsByMachine(
  windows: readonly MaintenanceWindow[] = MAINTENANCE_WINDOWS,
): Map<string, MaintenanceWindow[]> {
  const map = new Map<string, MaintenanceWindow[]>()
  for (const window of [...windows].sort(byStart)) {
    const list = map.get(window.machineId)
    if (list) list.push(window)
    else map.set(window.machineId, [window])
  }
  return map
}

/**
 * Windows keyed by weekday, 0 = Monday. Grouping uses the start minute, so a
 * window that somehow ran past midnight lands on the day it began rather than
 * being counted twice.
 */
export function groupWindowsByDay(
  windows: readonly MaintenanceWindow[] = MAINTENANCE_WINDOWS,
): Map<number, MaintenanceWindow[]> {
  const map = new Map<number, MaintenanceWindow[]>()
  for (const window of [...windows].sort(byStart)) {
    const day = dayOf(window.startMinute)
    const list = map.get(day)
    if (list) list.push(window)
    else map.set(day, [window])
  }
  return map
}

/**
 * A Rejection the rules engine can carry as-is. There is no maintenance code
 * in `RejectionCode`, and inventing one would mean changing the shared type:
 * `out-of-service` already says the right thing — the machine cannot be used
 * then — and the message carries the detail.
 */
export function maintenanceRejection(
  machine: Machine,
  interval: Interval,
  windows: readonly MaintenanceWindow[] = MAINTENANCE_WINDOWS,
): Rejection | null {
  const clashes = collidingWindows(machine.id, interval, windows)
  if (clashes.length === 0) return null

  return {
    code: 'out-of-service',
    message: `${machine.name} is down for maintenance then — ${clashes[0].reason}.`,
    conflictIds: clashes.map((window) => window.id),
  }
}

/** Minutes booked on one machine, by anybody. This is what wears it out. */
export function bookedMinutesForMachine(
  machineId: string,
  bookings: readonly Booking[],
): number {
  return bookings
    .filter((booking) => booking.machineId === machineId)
    .reduce((sum, booking) => sum + durationOf(booking), 0)
}

/** The most recently recorded service for a machine, or undefined. */
export function latestServiceFor(
  machineId: string,
  log: readonly ServiceLogEntry[],
): ServiceLogEntry | undefined {
  return log
    .filter((entry) => entry.machineId === machineId)
    .reduce<ServiceLogEntry | undefined>(
      (latest, entry) => (latest && latest.recordedAt >= entry.recordedAt ? latest : entry),
      undefined,
    )
}

export type ServiceState = 'untracked' | 'ok' | 'due-soon' | 'overdue'

export interface ServiceStatus {
  machineId: string
  /** 0 when the machine is not on a service schedule. */
  intervalMinutes: number
  /** Run minutes since the last service. */
  runMinutes: number
  /** Run minutes left before the service falls due; 0 once it has. */
  remainingMinutes: number
  /** Run minutes past the interval; 0 until the interval is reached. */
  overdueMinutes: number
  overdue: boolean
  /** 0–1, clamped, so a full bar never overflows its track. */
  fraction: number
  lastService: ServiceLogEntry | undefined
}

/**
 * How far through its service cycle a machine is.
 *
 * `bookedMinutes` is this week's booked time for the machine; the interval
 * fixture supplies whatever it had run before the week started. A logged
 * service rebases the count to the reading taken when the work was done, which
 * is what makes recording a service clear the flag.
 */
export function serviceStatus(
  machineId: string,
  bookedMinutes: number,
  log: readonly ServiceLogEntry[] = [],
  intervals: ReadonlyMap<string, ServiceInterval> = SERVICE_INTERVALS_BY_MACHINE,
): ServiceStatus {
  const interval = intervals.get(machineId)
  const lastService = latestServiceFor(machineId, log)
  const carried = interval?.minutesBeforeThisWeek ?? 0
  const intervalMinutes = interval?.intervalMinutes ?? 0

  // Never negative: a service logged against a reading larger than the current
  // one (say, bookings cancelled afterwards) means the cycle simply starts over.
  const runMinutes = Math.max(0, carried + bookedMinutes - (lastService?.runMinutesAtService ?? 0))
  const overdue = intervalMinutes > 0 && runMinutes >= intervalMinutes

  return {
    machineId,
    intervalMinutes,
    runMinutes,
    remainingMinutes: intervalMinutes > 0 ? Math.max(0, intervalMinutes - runMinutes) : 0,
    overdueMinutes: intervalMinutes > 0 ? Math.max(0, runMinutes - intervalMinutes) : 0,
    overdue,
    fraction: intervalMinutes > 0 ? Math.min(1, runMinutes / intervalMinutes) : 0,
    lastService,
  }
}

/** The word the interface shows, so status never rests on colour alone. */
export function serviceState(status: ServiceStatus): ServiceState {
  if (status.intervalMinutes === 0) return 'untracked'
  if (status.overdue) return 'overdue'
  return status.fraction >= DUE_SOON_FRACTION ? 'due-soon' : 'ok'
}

export function isOverdueForService(
  machineId: string,
  bookedMinutes: number,
  log: readonly ServiceLogEntry[] = [],
  intervals: ReadonlyMap<string, ServiceInterval> = SERVICE_INTERVALS_BY_MACHINE,
): boolean {
  return serviceStatus(machineId, bookedMinutes, log, intervals).overdue
}

/**
 * `svc-0007`. Ids come from the highest suffix already in use rather than a
 * counter or a random seed, so they survive a reload of persisted data.
 */
export function nextId(prefix: string, existing: readonly { id: string }[]): string {
  const highest = existing.reduce((top, item) => {
    const match = /^[a-z]+-(\d+)$/.exec(item.id)
    const value = match ? Number(match[1]) : 0
    return value > top ? value : top
  }, 0)

  return `${prefix}-${String(highest + 1).padStart(4, '0')}`
}
