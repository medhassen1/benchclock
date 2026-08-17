import { describe, expect, it } from 'vitest'

import { OPENING_HOURS } from '@/data/workshop'
import {
  ceilToSlot,
  dayOf,
  durationOf,
  floorToSlot,
  formatClock,
  formatDuration,
  formatWeekMinute,
  isSlotAligned,
  isWithinOpeningHours,
  isWithinWeek,
  minuteOfDay,
  overlapMinutes,
  overlaps,
  pad,
  slotsForDay,
  totalMinutes,
  weekMinute,
  windowFor,
} from '@/lib/weektime'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)
const span = (day: number, fromHour: number, toHour: number) => ({
  startMinute: at(day, fromHour),
  endMinute: at(day, toHour),
})

describe('week coordinates', () => {
  it('splits a week minute into day and minute-of-day', () => {
    expect(dayOf(at(0, 17))).toBe(0)
    expect(dayOf(at(3, 9, 30))).toBe(3)
    expect(minuteOfDay(at(3, 9, 30))).toBe(9 * 60 + 30)
  })

  it('round-trips through weekMinute', () => {
    const m = at(5, 14, 45)
    expect(weekMinute(dayOf(m), minuteOfDay(m))).toBe(m)
  })
})

describe('formatting', () => {
  it('formats a clock time zero-padded', () => {
    expect(formatClock(at(0, 9, 5))).toBe('09:05')
    expect(formatClock(at(2, 17, 30))).toBe('17:30')
    expect(formatClock(at(4, 0))).toBe('00:00')
  })

  it('prefixes the weekday', () => {
    expect(formatWeekMinute(at(0, 17, 30))).toBe('Mon 17:30')
    expect(formatWeekMinute(at(6, 10))).toBe('Sun 10:00')
  })

  it('formats durations in hours and minutes', () => {
    expect(formatDuration(45)).toBe('45 m')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(150)).toBe('2 h 30 m')
    expect(formatDuration(0)).toBe('0 m')
    expect(formatDuration(-30)).toBe('0 m')
  })
})

describe('overlaps', () => {
  it('detects a genuine overlap', () => {
    expect(overlaps(span(0, 17, 19), span(0, 18, 20))).toBe(true)
  })

  it('treats touching intervals as free', () => {
    expect(overlaps(span(0, 17, 18), span(0, 18, 19))).toBe(false)
    expect(overlapMinutes(span(0, 17, 18), span(0, 18, 19))).toBe(0)
  })

  it('is symmetric', () => {
    const a = span(0, 17, 19)
    const b = span(0, 18, 20)
    expect(overlaps(a, b)).toBe(overlaps(b, a))
  })

  it('detects full containment', () => {
    expect(overlaps(span(0, 17, 22), span(0, 18, 19))).toBe(true)
    expect(overlapMinutes(span(0, 17, 22), span(0, 18, 19))).toBe(60)
  })

  it('reports no overlap for disjoint intervals', () => {
    expect(overlaps(span(0, 17, 18), span(1, 17, 18))).toBe(false)
    expect(overlapMinutes(span(0, 17, 18), span(1, 17, 18))).toBe(0)
  })
})

describe('pad and duration', () => {
  it('grows an interval on both sides', () => {
    expect(pad(span(0, 17, 18), 30)).toEqual({
      startMinute: at(0, 16, 30),
      endMinute: at(0, 18, 30),
    })
  })

  it('leaves an interval alone when padding by zero', () => {
    const interval = span(0, 17, 18)
    expect(pad(interval, 0)).toEqual(interval)
  })

  it('measures duration', () => {
    expect(durationOf(span(0, 17, 19))).toBe(120)
  })
})

describe('slot alignment', () => {
  it('floors and ceils to the half hour', () => {
    expect(floorToSlot(at(0, 17, 20))).toBe(at(0, 17))
    expect(ceilToSlot(at(0, 17, 20))).toBe(at(0, 17, 30))
    expect(floorToSlot(at(0, 17, 30))).toBe(at(0, 17, 30))
    expect(ceilToSlot(at(0, 17, 30))).toBe(at(0, 17, 30))
  })

  it('recognises aligned minutes', () => {
    expect(isSlotAligned(at(0, 17, 30))).toBe(true)
    expect(isSlotAligned(at(0, 17, 20))).toBe(false)
    expect(isSlotAligned(17.5)).toBe(false)
  })
})

describe('week bounds', () => {
  it('accepts intervals inside the week', () => {
    expect(isWithinWeek(span(0, 17, 18))).toBe(true)
    expect(isWithinWeek(span(6, 10, 18))).toBe(true)
  })

  it('rejects intervals outside it', () => {
    expect(isWithinWeek({ startMinute: -30, endMinute: 60 })).toBe(false)
    expect(isWithinWeek({ startMinute: at(6, 23), endMinute: at(6, 23) + 120 })).toBe(false)
  })
})

describe('opening hours', () => {
  it('finds the window covering a minute', () => {
    expect(windowFor(at(0, 18), OPENING_HOURS)?.day).toBe(0)
    expect(windowFor(at(0, 9), OPENING_HOURS)).toBeUndefined()
  })

  it('treats the closing minute as shut', () => {
    expect(windowFor(at(0, 22), OPENING_HOURS)).toBeUndefined()
    expect(windowFor(at(0, 21, 59), OPENING_HOURS)).toBeDefined()
  })

  it('accepts a booking inside a single window', () => {
    expect(isWithinOpeningHours(span(0, 18, 20), OPENING_HOURS)).toBe(true)
  })

  it('rejects a booking that starts before opening', () => {
    expect(isWithinOpeningHours(span(0, 16, 18), OPENING_HOURS)).toBe(false)
  })

  it('rejects a booking that runs past closing', () => {
    expect(isWithinOpeningHours(span(0, 21, 23), OPENING_HOURS)).toBe(false)
  })

  it('allows a booking that ends exactly at closing', () => {
    expect(isWithinOpeningHours(span(0, 20, 22), OPENING_HOURS)).toBe(true)
  })

  it('rejects a booking straddling two days', () => {
    expect(
      isWithinOpeningHours({ startMinute: at(0, 21), endMinute: at(1, 18) }, OPENING_HOURS),
    ).toBe(false)
  })

  it('rejects a zero-length interval', () => {
    expect(isWithinOpeningHours(span(0, 18, 18), OPENING_HOURS)).toBe(false)
  })
})

describe('slotsForDay', () => {
  it('lists every half-hour slot that fits in the window', () => {
    const slots = slotsForDay(0, OPENING_HOURS)

    expect(slots[0]).toBe(at(0, 17))
    expect(slots.at(-1)).toBe(at(0, 21, 30))
    expect(slots).toHaveLength((22 - 17) * 2)
  })

  it('returns nothing for a day with no window', () => {
    expect(slotsForDay(0, [])).toEqual([])
  })

  it('covers the longer weekend window', () => {
    expect(slotsForDay(5, OPENING_HOURS)).toHaveLength((20 - 9) * 2)
  })
})

describe('totalMinutes', () => {
  it('sums durations', () => {
    expect(totalMinutes([span(0, 17, 18), span(1, 18, 20)])).toBe(180)
  })

  it('is zero for an empty list', () => {
    expect(totalMinutes([])).toBe(0)
  })
})
