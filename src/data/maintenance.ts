import { MINUTES_PER_DAY } from '@/data/workshop'

/**
 * Servicing fixtures. Like every other time in the app these are minutes from
 * Monday 00:00, so a window can be compared with a booking by integer maths
 * alone — no Date, no timezone, no clock reading.
 */

/** What a visit to the machine was for. */
export type MaintenanceKind = 'service' | 'calibration' | 'repair' | 'inspection'

export const MAINTENANCE_KIND_LABELS: Readonly<Record<MaintenanceKind, string>> = {
  service: 'Routine service',
  calibration: 'Calibration',
  repair: 'Repair',
  inspection: 'Safety inspection',
}

/** A stretch of the week a machine is unavailable because it is being worked on. */
export interface MaintenanceWindow {
  id: string
  machineId: string
  startMinute: number
  endMinute: number
  kind: MaintenanceKind
  /** Shown to whoever tries to book across the window. */
  reason: string
}

/** A window that has not been assigned an id yet. */
export type MaintenanceWindowDraft = Omit<MaintenanceWindow, 'id'>

/**
 * How much running a machine may do between services.
 *
 * `minutesBeforeThisWeek` carries the run time already accrued when the board
 * was opened, so a machine can start the week part-way through its cycle
 * without the app having to remember anything older than the current week.
 */
export interface ServiceInterval {
  machineId: string
  intervalMinutes: number
  minutesBeforeThisWeek: number
}

/** One completed service, written to the log by the keyholder who did it. */
export interface ServiceLogEntry {
  id: string
  machineId: string
  /** Keyholder who carried the work out. */
  memberId: string
  kind: MaintenanceKind
  notes: string
  /** When in the week the work was done, as minutes from Monday 00:00. */
  minute: number
  /**
   * The machine's run minutes at the moment of the service. Later readings are
   * measured against this, which is what makes a service reset the cycle.
   */
  runMinutesAtService: number
  /** Wall-clock stamp, used only to order entries recorded in the same minute. */
  recordedAt: number
}

/** A log entry before the provider stamps an id and a recording time on it. */
export type ServiceRecordDraft = Omit<ServiceLogEntry, 'id' | 'memberId' | 'recordedAt'>

const at = (day: number, hour: number, minute = 0) => day * MINUTES_PER_DAY + hour * 60 + minute

/**
 * Scheduled work for the week. Every window sits inside the workshop's opening
 * hours, because a machine shut overnight blocks nobody.
 */
export const MAINTENANCE_WINDOWS: readonly MaintenanceWindow[] = [
  {
    id: 'mw-0001',
    machineId: 'sewing-a',
    startMinute: at(0, 20),
    endMinute: at(0, 21),
    kind: 'service',
    reason: 'Timing and tension reset',
  },
  {
    id: 'mw-0002',
    machineId: 'laser-a',
    startMinute: at(1, 17),
    endMinute: at(1, 18, 30),
    kind: 'service',
    reason: 'Lens clean and mirror alignment',
  },
  {
    id: 'mw-0003',
    machineId: 'cnc-a',
    startMinute: at(2, 19),
    endMinute: at(2, 21),
    kind: 'calibration',
    reason: 'Spindle runout check',
  },
  {
    id: 'mw-0004',
    machineId: 'welder-a',
    startMinute: at(3, 17),
    endMinute: at(3, 20),
    kind: 'repair',
    reason: 'Wire feed motor replacement',
  },
  {
    id: 'mw-0005',
    machineId: 'printer-a',
    startMinute: at(5, 9),
    endMinute: at(5, 11),
    kind: 'service',
    reason: 'Resin tank replacement',
  },
  {
    id: 'mw-0006',
    machineId: 'laser-a',
    startMinute: at(5, 16),
    endMinute: at(5, 18),
    kind: 'inspection',
    reason: 'Extraction airflow test',
  },
  {
    id: 'mw-0007',
    machineId: 'lathe-a',
    startMinute: at(6, 10),
    endMinute: at(6, 12),
    kind: 'service',
    reason: 'Way oil and chuck strip-down',
  },
]

/**
 * One entry per tracked machine. The desktop laser is deliberately absent: a
 * machine with no interval is simply not on a service schedule, and the app
 * has to say so rather than pretend it is due.
 */
export const SERVICE_INTERVALS: readonly ServiceInterval[] = [
  { machineId: 'laser-a', intervalMinutes: 1200, minutesBeforeThisWeek: 1080 },
  { machineId: 'cnc-a', intervalMinutes: 1800, minutesBeforeThisWeek: 600 },
  { machineId: 'lathe-a', intervalMinutes: 2400, minutesBeforeThisWeek: 2400 },
  { machineId: 'printer-a', intervalMinutes: 3000, minutesBeforeThisWeek: 450 },
  { machineId: 'printer-b', intervalMinutes: 3000, minutesBeforeThisWeek: 2880 },
  { machineId: 'welder-a', intervalMinutes: 900, minutesBeforeThisWeek: 960 },
  { machineId: 'sewing-a', intervalMinutes: 1500, minutesBeforeThisWeek: 300 },
]

export const SERVICE_INTERVALS_BY_MACHINE: ReadonlyMap<string, ServiceInterval> = new Map(
  SERVICE_INTERVALS.map((interval) => [interval.machineId, interval]),
)

/** Above this share of the interval a machine is worth flagging before it trips. */
export const DUE_SOON_FRACTION = 0.8
