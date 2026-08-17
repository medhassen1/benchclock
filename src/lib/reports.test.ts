import { describe, expect, it } from 'vitest'

import { MACHINES, MEMBERS_BY_ID, OPENING_HOURS } from '@/data/workshop'
import {
  bookableMinutesFor,
  bookedMinutesInHours,
  compareWeeks,
  formatPercent,
  machineUtilisation,
  memberLeaderboard,
  occupancyMatrix,
  openMinutes,
  peakHours,
  quietSlots,
  toDelta,
  weekSummary,
  type ReportOptions,
} from '@/lib/reports'
import { weekMinute } from '@/lib/weektime'
import type { Booking, DayWindow, Machine, Member } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

/** Monday 18:00–20:00 and Tuesday 18:00–19:00: 180 bookable minutes a week. */
const HOURS: readonly DayWindow[] = [
  { day: 0, openMinute: 18 * 60, closeMinute: 20 * 60 },
  { day: 1, openMinute: 18 * 60, closeMinute: 19 * 60 },
]

const machine = (over: Partial<Machine> = {}): Machine => ({
  id: 'alpha',
  name: 'Alpha',
  kind: 'laser',
  code: 'AL1',
  requiredTicket: null,
  maxSessionMinutes: 240,
  cooldownMinutes: 0,
  location: 'Bay 1',
  outOfService: false,
  ...over,
})

const ALPHA = machine()
const BETA = machine({ id: 'beta', name: 'Beta', code: 'BE1' })
const BROKEN = machine({ id: 'broken', name: 'Broken', code: 'BR1', outOfService: true })

const member = (id: string): Member => {
  const found = MEMBERS_BY_ID.get(id)
  if (!found) throw new Error(`no member ${id}`)
  return found
}

/** 900-minute allowance. */
const ILRA = member('m-ilra')
/** 240-minute allowance. */
const PIA = member('m-pia')

const OPTIONS: ReportOptions = { machines: [ALPHA, BETA, BROKEN], hours: HOURS }

let nextId = 0

function booking(over: Partial<Booking> = {}): Booking {
  nextId += 1
  return {
    id: `bk-${nextId}`,
    machineId: 'alpha',
    memberId: ILRA.id,
    startMinute: at(0, 18),
    endMinute: at(0, 19),
    note: '',
    createdAt: 0,
    ...over,
  }
}

describe('formatPercent', () => {
  it('rounds a fraction to whole percent', () => {
    expect(formatPercent(0.75)).toBe('75%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })

  it('never leaks NaN or out-of-range values into the interface', () => {
    expect(formatPercent(Number.NaN)).toBe('0%')
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('0%')
    expect(formatPercent(-2)).toBe('0%')
    expect(formatPercent(4)).toBe('100%')
  })
})

describe('openMinutes', () => {
  it('sums every opening window', () => {
    expect(openMinutes(HOURS)).toBe(180)
  })

  it('is zero for a workshop that never opens', () => {
    expect(openMinutes([])).toBe(0)
  })

  it('defaults to the real opening hours', () => {
    expect(openMinutes()).toBe(openMinutes(OPENING_HOURS))
  })
})

describe('bookedMinutesInHours', () => {
  it('clips a booking that starts before opening', () => {
    expect(bookedMinutesInHours({ startMinute: at(0, 17), endMinute: at(0, 19) }, HOURS)).toBe(60)
  })

  it('ignores a booking made entirely while shut', () => {
    expect(bookedMinutesInHours({ startMinute: at(3, 9), endMinute: at(3, 12) }, HOURS)).toBe(0)
  })
})

describe('bookableMinutesFor', () => {
  it('gives an out-of-service machine no bookable time', () => {
    expect(bookableMinutesFor(BROKEN, HOURS)).toBe(0)
  })

  it('gives a working machine the full week of opening hours', () => {
    expect(bookableMinutesFor(ALPHA, HOURS)).toBe(180)
  })
})

describe('machineUtilisation', () => {
  it('reports zeroes, not NaN, when nothing is booked', () => {
    const rows = machineUtilisation([], OPTIONS)

    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.bookings).toBe(0)
      expect(row.bookedMinutes).toBe(0)
      expect(row.fraction).toBe(0)
      expect(Number.isNaN(row.fraction)).toBe(false)
    }
  })

  it('reaches exactly 100% for a fully booked machine', () => {
    const rows = machineUtilisation(
      [
        booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 20) }),
        booking({ machineId: 'alpha', startMinute: at(1, 18), endMinute: at(1, 19) }),
      ],
      OPTIONS,
    )

    expect(rows[0].machine.id).toBe('alpha')
    expect(rows[0].bookedMinutes).toBe(180)
    expect(rows[0].bookableMinutes).toBe(180)
    expect(rows[0].fraction).toBe(1)
  })

  it('keeps an out-of-service machine at 0 rather than dividing by zero', () => {
    const rows = machineUtilisation(
      [booking({ machineId: 'broken', startMinute: at(0, 18), endMinute: at(0, 19) })],
      OPTIONS,
    )
    const broken = rows.find((row) => row.machine.id === 'broken')

    expect(broken?.bookableMinutes).toBe(0)
    expect(broken?.bookedMinutes).toBe(60)
    expect(broken?.fraction).toBe(0)
  })

  it('counts only the minutes that fall inside opening hours', () => {
    const rows = machineUtilisation(
      [booking({ machineId: 'beta', startMinute: at(0, 17), endMinute: at(0, 19) })],
      OPTIONS,
    )
    const beta = rows.find((row) => row.machine.id === 'beta')

    expect(beta?.bookedMinutes).toBe(60)
    expect(beta?.fraction).toBeCloseTo(60 / 180)
  })

  it('orders the busiest machine first', () => {
    const rows = machineUtilisation(
      [
        booking({ machineId: 'beta', startMinute: at(0, 18), endMinute: at(0, 20) }),
        booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 19) }),
      ],
      OPTIONS,
    )

    expect(rows.map((row) => row.machine.id)).toEqual(['beta', 'alpha', 'broken'])
  })

  it('covers every real machine when no options are given', () => {
    expect(machineUtilisation([])).toHaveLength(MACHINES.length)
  })
})

describe('occupancyMatrix', () => {
  it('has a row per day and a column per hour the workshop can open', () => {
    const matrix = occupancyMatrix([], OPTIONS)

    expect(matrix.rows).toHaveLength(7)
    expect(matrix.hours).toEqual([18, 19])
    expect(matrix.fraction).toBe(0)
  })

  it('has no columns at all when the workshop never opens', () => {
    const matrix = occupancyMatrix([], { machines: [ALPHA], hours: [] })

    expect(matrix.hours).toEqual([])
    expect(matrix.rows).toHaveLength(7)
    expect(matrix.rows.every((row) => row.cells.length === 0)).toBe(true)
    expect(matrix.fraction).toBe(0)
  })

  it('measures a cell against the two bookable machines', () => {
    const matrix = occupancyMatrix(
      [booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 19) })],
      OPTIONS,
    )
    const cell = matrix.rows[0].cells[0]

    expect(cell.capacityMinutes).toBe(120)
    expect(cell.bookedMinutes).toBe(60)
    expect(cell.fraction).toBe(0.5)
    expect(cell.open).toBe(true)
  })

  it('marks hours the workshop is shut as closed with no capacity', () => {
    const matrix = occupancyMatrix([], OPTIONS)
    const tuesdaySecondHour = matrix.rows[1].cells[1]

    expect(tuesdaySecondHour.open).toBe(false)
    expect(tuesdaySecondHour.capacityMinutes).toBe(0)
    expect(tuesdaySecondHour.fraction).toBe(0)
  })

  it('reaches 100% when every bookable machine is taken for the hour', () => {
    const matrix = occupancyMatrix(
      [
        booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 19) }),
        booking({ machineId: 'beta', startMinute: at(0, 18), endMinute: at(0, 19) }),
      ],
      OPTIONS,
    )

    expect(matrix.rows[0].cells[0].fraction).toBe(1)
  })

  it('ignores minutes booked while the workshop is shut', () => {
    const matrix = occupancyMatrix(
      [booking({ machineId: 'alpha', startMinute: at(0, 17), endMinute: at(0, 19) })],
      OPTIONS,
    )

    // 17:00–18:00 is closed, so only the second hour of the booking counts.
    expect(matrix.rows[0].cells[0].bookedMinutes).toBe(60)
    expect(matrix.bookedMinutes).toBe(60)
  })

  it('leaves out-of-service machines out of capacity entirely', () => {
    const withBroken = occupancyMatrix([], OPTIONS)
    const withoutBroken = occupancyMatrix([], { machines: [ALPHA, BETA], hours: HOURS })

    expect(withBroken.capacityMinutes).toBe(withoutBroken.capacityMinutes)
  })
})

describe('peakHours', () => {
  it('is empty when nothing can be booked', () => {
    expect(peakHours(occupancyMatrix([], { machines: [ALPHA], hours: [] }))).toEqual([])
  })

  it('lists open hours even when the week is empty', () => {
    const ranking = peakHours(occupancyMatrix([], OPTIONS))

    expect(ranking).toHaveLength(3)
    expect(ranking.every((entry) => entry.fraction === 0)).toBe(true)
    expect(ranking.every((entry) => entry.rank === 1)).toBe(true)
  })

  it('ranks the most contended hour first', () => {
    const ranking = peakHours(
      occupancyMatrix(
        [
          booking({ machineId: 'alpha', startMinute: at(0, 19), endMinute: at(0, 20) }),
          booking({ machineId: 'beta', startMinute: at(0, 19), endMinute: at(0, 20) }),
          booking({ machineId: 'alpha', startMinute: at(1, 18), endMinute: at(1, 19) }),
        ],
        OPTIONS,
      ),
    )

    expect(ranking[0]).toMatchObject({ day: 0, hour: 19, fraction: 1, rank: 1 })
    expect(ranking[1]).toMatchObject({ day: 1, hour: 18, fraction: 0.5, rank: 2 })
    expect(ranking[2]).toMatchObject({ day: 0, hour: 18, fraction: 0, rank: 3 })
  })

  it('gives equally busy hours the same rank, ordered by day then hour', () => {
    const ranking = peakHours(
      occupancyMatrix(
        [
          booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 20) }),
          booking({ machineId: 'alpha', startMinute: at(1, 18), endMinute: at(1, 19) }),
        ],
        OPTIONS,
      ),
    )

    expect(ranking.map((entry) => [entry.day, entry.hour, entry.rank])).toEqual([
      [0, 18, 1],
      [0, 19, 1],
      [1, 18, 1],
    ])
  })

  it('honours the limit', () => {
    expect(peakHours(occupancyMatrix([], OPTIONS), 2)).toHaveLength(2)
    expect(peakHours(occupancyMatrix([], OPTIONS), 0)).toEqual([])
  })
})

describe('quietSlots', () => {
  it('returns the earliest slots when the week is completely empty', () => {
    const quiet = quietSlots([], { ...OPTIONS, limit: 3 })

    expect(quiet).toHaveLength(3)
    expect(quiet[0]).toMatchObject({
      day: 0,
      startMinute: at(0, 18),
      endMinute: at(0, 18, 30),
      bookedMachines: 0,
      freeMachines: 2,
      fraction: 0,
    })
    expect(quiet[1].startMinute).toBe(at(0, 18, 30))
  })

  it('is empty when the workshop never opens', () => {
    expect(quietSlots([], { machines: [ALPHA], hours: [] })).toEqual([])
  })

  it('puts the least demanded slot first', () => {
    const busy = [
      booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 20) }),
      booking({ machineId: 'beta', startMinute: at(0, 18), endMinute: at(0, 19, 30) }),
      booking({ machineId: 'alpha', startMinute: at(1, 18), endMinute: at(1, 18, 30) }),
    ]
    const quiet = quietSlots(busy, { ...OPTIONS, limit: 2 })

    expect(quiet[0]).toMatchObject({ day: 1, startMinute: at(1, 18, 30), bookedMachines: 0 })
    expect(quiet[1]).toMatchObject({ day: 0, startMinute: at(0, 19, 30), bookedMachines: 1 })
  })

  it('reports every slot as fully taken without exceeding 100%', () => {
    const busy = [
      booking({ machineId: 'alpha', startMinute: at(1, 18), endMinute: at(1, 19) }),
      booking({ machineId: 'beta', startMinute: at(1, 18), endMinute: at(1, 19) }),
    ]
    const quiet = quietSlots(busy, { machines: [ALPHA, BETA], hours: [HOURS[1]], limit: 5 })

    expect(quiet).toHaveLength(2)
    expect(quiet.every((slot) => slot.fraction === 1 && slot.freeMachines === 0)).toBe(true)
  })

  it('does not count bookings on out-of-service machines as demand', () => {
    const quiet = quietSlots(
      [booking({ machineId: 'broken', startMinute: at(0, 18), endMinute: at(0, 19) })],
      { ...OPTIONS, limit: 1 },
    )

    expect(quiet[0].bookedMachines).toBe(0)
  })
})

describe('memberLeaderboard', () => {
  it('lists every member with zeroes for an empty week', () => {
    const board = memberLeaderboard([], { members: [ILRA, PIA] })

    expect(board).toHaveLength(2)
    for (const standing of board) {
      expect(standing.bookedMinutes).toBe(0)
      expect(standing.allowanceFraction).toBe(0)
      expect(standing.shareOfWeek).toBe(0)
      expect(standing.rank).toBe(1)
    }
  })

  it('orders by booked minutes and reports allowance consumption', () => {
    const board = memberLeaderboard(
      [
        booking({ memberId: PIA.id, startMinute: at(0, 18), endMinute: at(0, 20) }),
        booking({ memberId: ILRA.id, startMinute: at(1, 18), endMinute: at(1, 19) }),
      ],
      { members: [ILRA, PIA] },
    )

    expect(board[0].member.id).toBe(PIA.id)
    expect(board[0].bookedMinutes).toBe(120)
    expect(board[0].allowance).toBe(240)
    expect(board[0].remaining).toBe(120)
    expect(board[0].allowanceFraction).toBe(0.5)
    expect(board[0].shareOfWeek).toBeCloseTo(120 / 180)
    expect(board[1].member.id).toBe(ILRA.id)
    expect(board[1].rank).toBe(2)
  })

  it('shares a rank between members with identical time', () => {
    const board = memberLeaderboard(
      [
        booking({ memberId: ILRA.id, startMinute: at(0, 18), endMinute: at(0, 19) }),
        booking({ memberId: PIA.id, startMinute: at(1, 18), endMinute: at(1, 19) }),
      ],
      { members: [ILRA, PIA] },
    )

    expect(board.map((standing) => standing.rank)).toEqual([1, 1])
    expect(board.map((standing) => standing.shareOfWeek)).toEqual([0.5, 0.5])
  })

  it('clamps a member who somehow booked past their allowance', () => {
    const board = memberLeaderboard(
      [booking({ memberId: PIA.id, startMinute: at(0, 12), endMinute: at(0, 20) })],
      { members: [PIA] },
    )

    expect(board[0].bookedMinutes).toBe(480)
    expect(board[0].allowanceFraction).toBe(1)
    expect(board[0].remaining).toBe(0)
  })
})

describe('weekSummary', () => {
  it('answers with zeroes and no busiest machine for an empty week', () => {
    const summary = weekSummary([], OPTIONS)

    expect(summary.bookingCount).toBe(0)
    expect(summary.bookedMinutes).toBe(0)
    expect(summary.bookableMinutes).toBe(360)
    expect(summary.fraction).toBe(0)
    expect(summary.activeMembers).toBe(0)
    expect(summary.busiest).toBeNull()
  })

  it('has no quietest day when the workshop never opens', () => {
    expect(weekSummary([], { machines: [ALPHA], hours: [] }).quietestDay).toBeNull()
  })

  it('names the busiest machine and counts active members', () => {
    const summary = weekSummary(
      [
        booking({ machineId: 'beta', memberId: PIA.id, startMinute: at(0, 18), endMinute: at(0, 20) }),
        booking({ machineId: 'alpha', memberId: ILRA.id, startMinute: at(1, 18), endMinute: at(1, 19) }),
      ],
      OPTIONS,
    )

    expect(summary.busiest?.machine.id).toBe('beta')
    expect(summary.activeMembers).toBe(2)
    expect(summary.bookedMinutes).toBe(180)
    expect(summary.fraction).toBe(0.5)
  })

  it('picks the least booked open day as the quietest', () => {
    const summary = weekSummary(
      [booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 20) })],
      OPTIONS,
    )

    expect(summary.quietestDay?.day).toBe(1)
  })
})

describe('toDelta', () => {
  it('describes growth, decline and no change in a direction', () => {
    expect(toDelta(10, 15)).toMatchObject({ delta: 5, changeFraction: 0.5, direction: 'up' })
    expect(toDelta(10, 5)).toMatchObject({ delta: -5, changeFraction: -0.5, direction: 'down' })
    expect(toDelta(10, 10)).toMatchObject({ delta: 0, changeFraction: 0, direction: 'flat' })
  })

  it('refuses a relative change when there was nothing to grow from', () => {
    expect(toDelta(0, 90)).toMatchObject({ changeFraction: null, direction: 'up' })
    expect(toDelta(0, 0)).toMatchObject({ changeFraction: null, direction: 'flat' })
  })
})

describe('compareWeeks', () => {
  const lastWeek = [
    booking({ machineId: 'alpha', memberId: ILRA.id, startMinute: at(0, 18), endMinute: at(0, 20) }),
  ]
  const thisWeek = [
    booking({ machineId: 'alpha', memberId: ILRA.id, startMinute: at(0, 18), endMinute: at(0, 19) }),
    booking({ machineId: 'beta', memberId: PIA.id, startMinute: at(1, 18), endMinute: at(1, 19) }),
  ]

  it('reports flat zeroes when both weeks are empty', () => {
    const comparison = compareWeeks([], [], OPTIONS)

    expect(comparison.bookedMinutes).toMatchObject({ previous: 0, current: 0, direction: 'flat' })
    expect(comparison.utilisation.changeFraction).toBeNull()
    expect(comparison.machines).toHaveLength(3)
    expect(comparison.machines.every((entry) => entry.minutes.delta === 0)).toBe(true)
  })

  it('treats an empty previous week as growth without a ratio', () => {
    const comparison = compareWeeks([], thisWeek, OPTIONS)

    expect(comparison.bookedMinutes).toMatchObject({
      previous: 0,
      current: 120,
      delta: 120,
      changeFraction: null,
      direction: 'up',
    })
    expect(comparison.bookingCount.direction).toBe('up')
    expect(comparison.activeMembers).toMatchObject({ previous: 0, current: 2 })
  })

  it('treats an empty current week as a fall to nothing', () => {
    const comparison = compareWeeks(lastWeek, [], OPTIONS)

    expect(comparison.bookedMinutes).toMatchObject({
      previous: 120,
      current: 0,
      delta: -120,
      changeFraction: -1,
      direction: 'down',
    })
    expect(comparison.utilisation.direction).toBe('down')
  })

  it('compares each machine and puts the biggest mover first', () => {
    const comparison = compareWeeks(lastWeek, thisWeek, OPTIONS)

    expect(comparison.machines[0].machine.id).toBe('alpha')
    expect(comparison.machines[0].minutes).toMatchObject({ previous: 120, current: 60, delta: -60 })
    expect(comparison.machines[1].machine.id).toBe('beta')
    expect(comparison.machines[1].minutes).toMatchObject({ previous: 0, current: 60, delta: 60 })
    expect(comparison.machines[2].machine.id).toBe('broken')
  })

  it('keeps an out-of-service machine at a flat zero utilisation', () => {
    const comparison = compareWeeks(
      [],
      [booking({ machineId: 'broken', startMinute: at(0, 18), endMinute: at(0, 19) })],
      OPTIONS,
    )
    const broken = comparison.machines.find((entry) => entry.machine.id === 'broken')

    expect(broken?.fraction).toMatchObject({ previous: 0, current: 0, direction: 'flat' })
    expect(broken?.minutes.current).toBe(60)
  })
})
