import type { DayWindow, Machine, MachineKind, Member, Ticket } from '@/types'

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export const MINUTES_PER_DAY = 24 * 60
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

/** Slots are half-hourly; every booking snaps to this grid. */
export const SLOT_MINUTES = 30

export const MACHINE_KIND_LABELS: Readonly<Record<MachineKind, string>> = {
  laser: 'Laser cutter',
  cnc: 'CNC router',
  lathe: 'Lathe',
  printer3d: '3D printer',
  welder: 'Welder',
  sewing: 'Sewing machine',
}

export const TICKET_LABELS: Readonly<Record<Ticket, string>> = {
  'laser-basic': 'Laser basic',
  'cnc-basic': 'CNC basic',
  'cnc-advanced': 'CNC advanced',
  metalwork: 'Metalwork',
  textiles: 'Textiles',
}

/** Weekday evenings plus longer weekend hours. */
export const OPENING_HOURS: readonly DayWindow[] = [
  { day: 0, openMinute: 17 * 60, closeMinute: 22 * 60 },
  { day: 1, openMinute: 17 * 60, closeMinute: 22 * 60 },
  { day: 2, openMinute: 17 * 60, closeMinute: 22 * 60 },
  { day: 3, openMinute: 17 * 60, closeMinute: 22 * 60 },
  { day: 4, openMinute: 15 * 60, closeMinute: 21 * 60 },
  { day: 5, openMinute: 9 * 60, closeMinute: 20 * 60 },
  { day: 6, openMinute: 10 * 60, closeMinute: 18 * 60 },
]

export const MACHINES: readonly Machine[] = [
  {
    id: 'laser-a',
    name: 'Big laser',
    kind: 'laser',
    code: 'LZ1',
    requiredTicket: 'laser-basic',
    maxSessionMinutes: 120,
    cooldownMinutes: 30,
    location: 'Bay 1',
    outOfService: false,
  },
  {
    id: 'laser-b',
    name: 'Desktop laser',
    kind: 'laser',
    code: 'LZ2',
    requiredTicket: 'laser-basic',
    maxSessionMinutes: 90,
    cooldownMinutes: 15,
    location: 'Bay 1',
    outOfService: false,
  },
  {
    id: 'cnc-a',
    name: 'CNC router',
    kind: 'cnc',
    code: 'CN1',
    requiredTicket: 'cnc-advanced',
    maxSessionMinutes: 180,
    cooldownMinutes: 30,
    location: 'Bay 2',
    outOfService: false,
  },
  {
    id: 'lathe-a',
    name: 'Metal lathe',
    kind: 'lathe',
    code: 'LA1',
    requiredTicket: 'metalwork',
    maxSessionMinutes: 120,
    cooldownMinutes: 0,
    location: 'Bay 2',
    outOfService: false,
  },
  {
    id: 'printer-a',
    name: 'Resin printer',
    kind: 'printer3d',
    code: 'PR1',
    requiredTicket: null,
    maxSessionMinutes: 240,
    cooldownMinutes: 60,
    location: 'Bay 3',
    outOfService: false,
  },
  {
    id: 'printer-b',
    name: 'Filament printer',
    kind: 'printer3d',
    code: 'PR2',
    requiredTicket: null,
    maxSessionMinutes: 300,
    cooldownMinutes: 0,
    location: 'Bay 3',
    outOfService: false,
  },
  {
    id: 'welder-a',
    name: 'MIG welder',
    kind: 'welder',
    code: 'WD1',
    requiredTicket: 'metalwork',
    maxSessionMinutes: 90,
    cooldownMinutes: 30,
    location: 'Yard',
    outOfService: true,
  },
  {
    id: 'sewing-a',
    name: 'Overlocker',
    kind: 'sewing',
    code: 'SW1',
    requiredTicket: 'textiles',
    maxSessionMinutes: 120,
    cooldownMinutes: 0,
    location: 'Studio',
    outOfService: false,
  },
]

export const MACHINES_BY_ID: ReadonlyMap<string, Machine> = new Map(
  MACHINES.map((machine) => [machine.id, machine]),
)

export const MEMBERS: readonly Member[] = [
  {
    id: 'm-ilra',
    name: 'Ilra Diagana',
    tier: 'keyholder',
    tickets: ['laser-basic', 'cnc-basic', 'cnc-advanced', 'metalwork'],
    weeklyMinuteAllowance: 900,
  },
  {
    id: 'm-tomas',
    name: 'Tomas Berg',
    tier: 'regular',
    tickets: ['laser-basic', 'textiles'],
    weeklyMinuteAllowance: 480,
  },
  {
    id: 'm-nour',
    name: 'Nour Haddad',
    tier: 'regular',
    tickets: ['metalwork'],
    weeklyMinuteAllowance: 480,
  },
  {
    id: 'm-pia',
    name: 'Pia Lindqvist',
    tier: 'casual',
    tickets: [],
    weeklyMinuteAllowance: 240,
  },
]

export const MEMBERS_BY_ID: ReadonlyMap<string, Member> = new Map(
  MEMBERS.map((member) => [member.id, member]),
)
