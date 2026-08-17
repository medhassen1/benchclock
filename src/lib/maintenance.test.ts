import { describe, expect, it } from 'vitest'

import {
  MAINTENANCE_WINDOWS,
  type MaintenanceWindow,
  type ServiceInterval,
  type ServiceLogEntry,
} from '@/data/maintenance'
import { MACHINES_BY_ID } from '@/data/workshop'
import {
  bookedMinutesForMachine,
  collidesWithMaintenance,
  collidingWindows,
  groupWindowsByDay,
  groupWindowsByMachine,
  isOverdueForService,
  latestServiceFor,
  maintenanceRejection,
  nextId,
  nextWindowFor,
  serviceState,
  serviceStatus,
  windowsForMachine,
} from '@/lib/maintenance'
import { weekMinute } from '@/lib/weektime'
import type { Booking, Machine } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const machine = (id: string): Machine => {
  const found = MACHINES_BY_ID.get(id)
  if (!found) throw new Error(`no machine ${id}`)
  return found
}

function window(over: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id: 'mw-test',
    machineId: 'laser-a',
    startMinute: at(1, 17),
    endMinute: at(1, 19),
    kind: 'service',
    reason: 'Lens clean',
    ...over,
  }
}

function entry(over: Partial<ServiceLogEntry> = {}): ServiceLogEntry {
  return {
    id: 'svc-0001',
    machineId: 'laser-a',
    memberId: 'm-ilra',
    kind: 'service',
    notes: 'Replaced the lens',
    minute: at(1, 19),
    runMinutesAtService: 0,
    recordedAt: 1,
    ...over,
  }
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'bk-0001',
    machineId: 'laser-a',
    memberId: 'm-ilra',
    startMinute: at(0, 18),
    endMinute: at(0, 19),
    note: '',
    createdAt: 0,
    ...over,
  }
}

/** Interval fixtures stand in for the shipped ones so tests state their own numbers. */
const intervals = (...entries: ServiceInterval[]): ReadonlyMap<string, ServiceInterval> =>
  new Map(entries.map((interval) => [interval.machineId, interval]))

describe('window collisions', () => {
  it('reports a booking that runs into a window', () => {
    const windows = [window()]

    expect(
      collidesWithMaintenance('laser-a', { startMinute: at(1, 18), endMinute: at(1, 20) }, windows),
    ).toBe(true)
  })

  it('does not collide when a booking ends exactly as a window starts', () => {
    const windows = [window()]

    expect(
      collidesWithMaintenance('laser-a', { startMinute: at(1, 16), endMinute: at(1, 17) }, windows),
    ).toBe(false)
  })

  it('does not collide when a booking starts exactly as a window ends', () => {
    const windows = [window()]

    expect(
      collidesWithMaintenance('laser-a', { startMinute: at(1, 19), endMinute: at(1, 20) }, windows),
    ).toBe(false)
  })

  it('ignores windows belonging to another machine', () => {
    const windows = [window({ machineId: 'cnc-a' })]

    expect(
      collidesWithMaintenance('laser-a', { startMinute: at(1, 17), endMinute: at(1, 19) }, windows),
    ).toBe(false)
  })

  it('collides with a booking swallowed whole by a window', () => {
    const windows = [window()]

    expect(
      collidingWindows(
        'laser-a',
        { startMinute: at(1, 17, 30), endMinute: at(1, 18) },
        windows,
      ),
    ).toHaveLength(1)
  })

  it('returns every colliding window, earliest first', () => {
    const windows = [
      window({ id: 'mw-b', startMinute: at(1, 19), endMinute: at(1, 21) }),
      window({ id: 'mw-a' }),
    ]

    expect(
      collidingWindows(
        'laser-a',
        { startMinute: at(1, 18), endMinute: at(1, 20) },
        windows,
      ).map((found) => found.id),
    ).toEqual(['mw-a', 'mw-b'])
  })

  it('finds nothing for a machine with no windows at all', () => {
    expect(
      collidingWindows(
        'printer-b',
        { startMinute: at(1, 17), endMinute: at(1, 19) },
        MAINTENANCE_WINDOWS,
      ),
    ).toEqual([])
  })
})

describe('maintenanceRejection', () => {
  it('returns null when nothing clashes', () => {
    expect(
      maintenanceRejection(machine('laser-a'), { startMinute: at(0, 17), endMinute: at(0, 18) }, [
        window(),
      ]),
    ).toBeNull()
  })

  it('is shaped like any other rejection, naming the clashing windows', () => {
    const result = maintenanceRejection(
      machine('laser-a'),
      { startMinute: at(1, 18), endMinute: at(1, 20) },
      [window({ id: 'mw-x' })],
    )

    expect(result).toEqual({
      code: 'out-of-service',
      message: 'Big laser is down for maintenance then — Lens clean.',
      conflictIds: ['mw-x'],
    })
  })
})

describe('grouping', () => {
  it('lists a machine\'s windows earliest first', () => {
    const windows = [
      window({ id: 'late', startMinute: at(5, 16), endMinute: at(5, 18) }),
      window({ id: 'early' }),
      window({ id: 'other', machineId: 'cnc-a' }),
    ]

    expect(windowsForMachine('laser-a', windows).map((found) => found.id)).toEqual([
      'early',
      'late',
    ])
  })

  it('returns an empty list for a machine with no windows', () => {
    expect(windowsForMachine('printer-b', MAINTENANCE_WINDOWS)).toEqual([])
  })

  it('groups windows by machine', () => {
    const grouped = groupWindowsByMachine(MAINTENANCE_WINDOWS)

    expect(grouped.get('laser-a')).toHaveLength(2)
    expect(grouped.get('cnc-a')).toHaveLength(1)
    expect(grouped.has('printer-b')).toBe(false)
  })

  it('groups windows by weekday, using the day they begin', () => {
    const windows = [
      window({ id: 'mon', startMinute: at(0, 20), endMinute: at(0, 21) }),
      window({ id: 'tue-late', startMinute: at(1, 20), endMinute: at(1, 21) }),
      window({ id: 'tue-early' }),
    ]

    const grouped = groupWindowsByDay(windows)

    expect(grouped.get(0)?.map((found) => found.id)).toEqual(['mon'])
    expect(grouped.get(1)?.map((found) => found.id)).toEqual(['tue-early', 'tue-late'])
    expect(grouped.get(6)).toBeUndefined()
  })

  it('groups nothing when there are no windows', () => {
    expect(groupWindowsByDay([]).size).toBe(0)
    expect(groupWindowsByMachine([]).size).toBe(0)
  })
})

describe('nextWindowFor', () => {
  it('finds the first window that has not finished yet', () => {
    const windows = [
      window({ id: 'first' }),
      window({ id: 'second', startMinute: at(5, 16), endMinute: at(5, 18) }),
    ]

    expect(nextWindowFor('laser-a', 0, windows)?.id).toBe('first')
    expect(nextWindowFor('laser-a', at(1, 19), windows)?.id).toBe('second')
  })

  it('still returns a window that is already under way', () => {
    expect(nextWindowFor('laser-a', at(1, 18), [window()])?.id).toBe('mw-test')
  })

  it('returns undefined once the week\'s windows are behind us', () => {
    expect(nextWindowFor('laser-a', at(6, 23), [window()])).toBeUndefined()
  })

  it('returns undefined for a machine with no windows', () => {
    expect(nextWindowFor('printer-b', 0, MAINTENANCE_WINDOWS)).toBeUndefined()
  })
})

describe('booked minutes per machine', () => {
  it('counts every member\'s time on that machine', () => {
    const bookings = [
      booking({ id: 'a' }),
      booking({ id: 'b', memberId: 'm-pia', startMinute: at(0, 19), endMinute: at(0, 21) }),
      booking({ id: 'c', machineId: 'cnc-a', startMinute: at(0, 19), endMinute: at(0, 20) }),
    ]

    expect(bookedMinutesForMachine('laser-a', bookings)).toBe(180)
    expect(bookedMinutesForMachine('cnc-a', bookings)).toBe(60)
    expect(bookedMinutesForMachine('printer-b', bookings)).toBe(0)
  })

  it('counts nothing on an empty board', () => {
    expect(bookedMinutesForMachine('laser-a', [])).toBe(0)
  })
})

describe('service status', () => {
  const tracked = intervals({
    machineId: 'laser-a',
    intervalMinutes: 600,
    minutesBeforeThisWeek: 300,
  })

  it('adds this week\'s bookings to what the machine had already run', () => {
    const status = serviceStatus('laser-a', 120, [], tracked)

    expect(status.runMinutes).toBe(420)
    expect(status.remainingMinutes).toBe(180)
    expect(status.overdue).toBe(false)
    expect(serviceState(status)).toBe('ok')
  })

  it('is overdue exactly at the threshold, not one minute later', () => {
    const below = serviceStatus('laser-a', 299, [], tracked)
    const exactly = serviceStatus('laser-a', 300, [], tracked)

    expect(below.overdue).toBe(false)
    expect(exactly.runMinutes).toBe(600)
    expect(exactly.overdue).toBe(true)
    expect(exactly.overdueMinutes).toBe(0)
    expect(exactly.remainingMinutes).toBe(0)
    expect(serviceState(exactly)).toBe('overdue')
  })

  it('reports how far past due a machine has run', () => {
    const status = serviceStatus('laser-a', 400, [], tracked)

    expect(status.overdueMinutes).toBe(100)
    expect(status.fraction).toBe(1)
  })

  it('warns before the interval is reached', () => {
    // 480 of 600 minutes is exactly the four-fifths mark.
    expect(serviceState(serviceStatus('laser-a', 180, [], tracked))).toBe('due-soon')
    expect(serviceState(serviceStatus('laser-a', 179, [], tracked))).toBe('ok')
  })

  it('treats a machine with no interval as untracked rather than due', () => {
    const status = serviceStatus('laser-b', 5000, [], tracked)

    expect(status.intervalMinutes).toBe(0)
    expect(status.overdue).toBe(false)
    expect(status.fraction).toBe(0)
    expect(serviceState(status)).toBe('untracked')
  })

  it('clears the cycle once a service is logged', () => {
    const log = [entry({ runMinutesAtService: 600 })]
    const status = serviceStatus('laser-a', 300, log, tracked)

    expect(status.runMinutes).toBe(0)
    expect(status.overdue).toBe(false)
    expect(status.lastService?.id).toBe('svc-0001')
  })

  it('counts run time accrued after the service', () => {
    const log = [entry({ runMinutesAtService: 400 })]

    expect(serviceStatus('laser-a', 200, log, tracked).runMinutes).toBe(100)
  })

  it('never reports negative run time when bookings disappear after a service', () => {
    const log = [entry({ runMinutesAtService: 600 })]

    expect(serviceStatus('laser-a', 0, log, tracked).runMinutes).toBe(0)
  })

  it('ignores services logged against another machine', () => {
    const log = [entry({ machineId: 'cnc-a', runMinutesAtService: 600 })]

    expect(serviceStatus('laser-a', 300, log, tracked).runMinutes).toBe(600)
  })

  it('rebases on the newest service when several are logged', () => {
    const log = [
      entry({ id: 'svc-0001', runMinutesAtService: 100, recordedAt: 1 }),
      entry({ id: 'svc-0002', runMinutesAtService: 500, recordedAt: 2 }),
    ]

    expect(latestServiceFor('laser-a', log)?.id).toBe('svc-0002')
    expect(serviceStatus('laser-a', 300, log, tracked).runMinutes).toBe(100)
  })

  it('finds no last service in an empty log', () => {
    expect(latestServiceFor('laser-a', [])).toBeUndefined()
  })

  it('answers the overdue question directly', () => {
    expect(isOverdueForService('laser-a', 300, [], tracked)).toBe(true)
    expect(isOverdueForService('laser-a', 0, [], tracked)).toBe(false)
  })
})

describe('nextId', () => {
  it('starts at one for an empty list', () => {
    expect(nextId('svc', [])).toBe('svc-0001')
  })

  it('follows the highest suffix in use, not the list length', () => {
    expect(nextId('svc', [{ id: 'svc-0001' }, { id: 'svc-0009' }, { id: 'svc-0003' }])).toBe(
      'svc-0010',
    )
  })

  it('ignores ids that do not carry a number', () => {
    expect(nextId('mw', [{ id: 'seeded' }, { id: 'mw-0002' }])).toBe('mw-0003')
  })
})
