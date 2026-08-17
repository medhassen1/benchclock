import { describe, expect, it } from 'vitest'

import { MACHINES_BY_ID, MEMBERS_BY_ID, MINUTES_PER_WEEK } from '@/data/workshop'
import {
  absoluteStartMinute,
  expandSeries,
  makeSeriesId,
  MAX_REPEAT_COUNT,
  occurrenceAsBooking,
  occurrenceCount,
  occurrenceId,
  occurrenceMinutes,
  planSeries,
  seriesTotalMinutes,
  summariseSeries,
  type SeriesDefinition,
  type SeriesRuleContext,
} from '@/lib/recurrence'
import { weekMinute } from '@/lib/weektime'
import type { Booking, Machine, Member, RejectionCode } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const machine = (id: string): Machine => {
  const found = MACHINES_BY_ID.get(id)
  if (!found) throw new Error(`no machine ${id}`)
  return found
}

const member = (id: string): Member => {
  const found = MEMBERS_BY_ID.get(id)
  if (!found) throw new Error(`no member ${id}`)
  return found
}

/** Ilra holds every ticket and a 900-minute allowance. */
const ILRA = member('m-ilra')
/** Pia holds no tickets and a 240-minute allowance. */
const PIA = member('m-pia')

function series(over: Partial<SeriesDefinition> = {}): SeriesDefinition {
  return {
    id: 'sr-0001',
    machineId: 'laser-a',
    memberId: ILRA.id,
    startMinute: at(0, 18),
    endMinute: at(0, 19),
    note: 'Lamp base',
    repeatCount: 3,
    mode: 'skip-refused',
    createdAt: 0,
    ...over,
  }
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'bk-existing',
    machineId: 'laser-a',
    memberId: 'm-tomas',
    startMinute: at(0, 18),
    endMinute: at(0, 19),
    note: '',
    createdAt: 0,
    ...over,
  }
}

function context(over: Partial<SeriesRuleContext> = {}): SeriesRuleContext {
  return { machine: machine('laser-a'), member: ILRA, existing: [], ...over }
}

const codes = (rejections: readonly { code: RejectionCode }[]) => rejections.map((r) => r.code)
const acceptedWeeks = (definition: SeriesDefinition, ctx: SeriesRuleContext) =>
  planSeries(definition, ctx)
    .outcomes.filter((outcome) => outcome.accepted)
    .map((outcome) => outcome.occurrence.weekIndex)

describe('expandSeries', () => {
  it('produces one occurrence per week, in week order', () => {
    const occurrences = expandSeries(series({ repeatCount: 3 }))

    expect(occurrences.map((o) => o.weekIndex)).toEqual([0, 1, 2])
  })

  it('repeats the same slot in every week', () => {
    const occurrences = expandSeries(series({ repeatCount: 2 }))

    expect(occurrences[0].draft).toEqual(occurrences[1].draft)
    expect(occurrences[0].draft).toEqual({
      machineId: 'laser-a',
      memberId: ILRA.id,
      startMinute: at(0, 18),
      endMinute: at(0, 19),
      note: 'Lamp base',
    })
  })

  it('gives every occurrence an id derived from the series and week', () => {
    const occurrences = expandSeries(series({ repeatCount: 2 }))

    expect(occurrences.map((o) => o.id)).toEqual(['sr-0001#w0', 'sr-0001#w1'])
    expect(occurrenceId('sr-0009', 4)).toBe('sr-0009#w4')
    expect(occurrences.every((o) => o.seriesId === 'sr-0001')).toBe(true)
  })

  it('expands an empty series to nothing', () => {
    expect(expandSeries(series({ repeatCount: 0 }))).toEqual([])
  })

  it('treats a negative or broken count as empty', () => {
    expect(expandSeries(series({ repeatCount: -4 }))).toEqual([])
    expect(expandSeries(series({ repeatCount: Number.NaN }))).toEqual([])
    expect(occurrenceCount(series({ repeatCount: Number.POSITIVE_INFINITY }))).toBe(0)
  })

  it('rounds a fractional count down', () => {
    expect(occurrenceCount(series({ repeatCount: 2.9 }))).toBe(2)
  })

  it('never runs past the maximum term', () => {
    expect(occurrenceCount(series({ repeatCount: 500 }))).toBe(MAX_REPEAT_COUNT)
    expect(expandSeries(series({ repeatCount: 500 }))).toHaveLength(MAX_REPEAT_COUNT)
  })

  it('places each occurrence a whole week after the last on the timeline', () => {
    const [first, second] = expandSeries(series({ repeatCount: 2 }))

    expect(absoluteStartMinute(first)).toBe(at(0, 18))
    expect(absoluteStartMinute(second)).toBe(at(0, 18) + MINUTES_PER_WEEK)
  })

  it('reads an occurrence as a booking the rules engine understands', () => {
    const [first] = expandSeries(series({ repeatCount: 1 }))

    expect(occurrenceAsBooking(first)).toEqual({
      id: 'sr-0001#w0',
      machineId: 'laser-a',
      memberId: ILRA.id,
      startMinute: at(0, 18),
      endMinute: at(0, 19),
      note: 'Lamp base',
      createdAt: 0,
    })
  })
})

describe('series length', () => {
  it('multiplies the slot by the number of weeks', () => {
    expect(occurrenceMinutes(series())).toBe(60)
    expect(seriesTotalMinutes(series({ repeatCount: 3 }))).toBe(180)
  })

  it('counts an empty series as no machine time', () => {
    expect(seriesTotalMinutes(series({ repeatCount: 0 }))).toBe(0)
  })

  it('never reports negative time for a backwards slot', () => {
    expect(occurrenceMinutes(series({ startMinute: at(0, 19), endMinute: at(0, 18) }))).toBe(0)
  })
})

describe('makeSeriesId', () => {
  it('starts at the first id', () => {
    expect(makeSeriesId([])).toBe('sr-0001')
  })

  it('skips ids already taken', () => {
    expect(makeSeriesId(['sr-0001', 'sr-0002'])).toBe('sr-0003')
  })

  it('fills a gap left by a cancelled series', () => {
    expect(makeSeriesId(['sr-0001', 'sr-0003'])).toBe('sr-0002')
  })

  it('ignores ids that are not series ids', () => {
    expect(makeSeriesId(['bk-0001'])).toBe('sr-0001')
  })
})

describe('planSeries', () => {
  it('accepts every week when nothing is in the way', () => {
    const plan = planSeries(series({ repeatCount: 4 }), context())

    expect(plan.outcomes).toHaveLength(4)
    expect(plan.outcomes.every((outcome) => outcome.accepted)).toBe(true)
    expect(plan.applied).toHaveLength(4)
    expect(plan.ok).toBe(true)
  })

  it('plans an empty series as nothing to do', () => {
    const plan = planSeries(series({ repeatCount: 0 }), context())

    expect(plan.outcomes).toEqual([])
    expect(plan.applied).toEqual([])
    expect(plan.ok).toBe(false)
  })

  it('only lets the board block the week it belongs to', () => {
    const plan = planSeries(
      series({ repeatCount: 3 }),
      context({ existing: [booking()] }),
    )

    expect(codes(plan.outcomes[0].rejections)).toContain('overlaps-booking')
    expect(acceptedWeeks(series({ repeatCount: 3 }), context({ existing: [booking()] }))).toEqual([
      1, 2,
    ])
  })

  it('reports the cool-down a neighbouring booking imposes', () => {
    const plan = planSeries(
      series({ repeatCount: 1, startMinute: at(0, 19), endMinute: at(0, 20) }),
      context({ existing: [booking({ startMinute: at(0, 18), endMinute: at(0, 18, 45) })] }),
    )

    expect(codes(plan.outcomes[0].rejections)).toContain('ignores-cooldown')
  })

  it('refuses every week when the member lacks the sign-off', () => {
    const plan = planSeries(
      series({ repeatCount: 3, memberId: PIA.id }),
      context({ member: PIA }),
    )

    expect(plan.outcomes.every((outcome) => codes(outcome.rejections).includes('missing-ticket')))
      .toBe(true)
    expect(plan.applied).toEqual([])
    expect(plan.ok).toBe(false)
  })

  it('refuses every week when the machine is out of service', () => {
    const plan = planSeries(
      series({ repeatCount: 2, machineId: 'welder-a', startMinute: at(0, 18), endMinute: at(0, 19) }),
      context({ machine: machine('welder-a') }),
    )

    expect(codes(plan.outcomes[0].rejections)).toContain('out-of-service')
    expect(codes(plan.outcomes[1].rejections)).toContain('out-of-service')
  })

  it('refuses a slot that runs past closing time', () => {
    const plan = planSeries(
      series({ repeatCount: 2, startMinute: at(0, 21, 30), endMinute: at(0, 22, 30) }),
      context(),
    )

    expect(codes(plan.outcomes[0].rejections)).toContain('outside-opening-hours')
  })

  it('refuses a slot longer than the machine allows', () => {
    const plan = planSeries(
      series({ repeatCount: 1, startMinute: at(5, 9), endMinute: at(5, 12, 30) }),
      context(),
    )

    expect(codes(plan.outcomes[0].rejections)).toContain('too-long')
  })

  it('accepts the last slot of the week, up to Sunday closing', () => {
    const plan = planSeries(
      series({ repeatCount: 2, startMinute: at(6, 17), endMinute: at(6, 18) }),
      context(),
    )

    expect(plan.outcomes.every((outcome) => outcome.accepted)).toBe(true)
  })

  it('refuses a slot that would spill past Sunday into the next week', () => {
    const overflowing = series({
      repeatCount: 2,
      startMinute: at(6, 23, 30),
      endMinute: at(6, 23, 30) + 60,
    })

    expect(overflowing.endMinute).toBeGreaterThan(MINUTES_PER_WEEK)

    const plan = planSeries(overflowing, context())

    expect(codes(plan.outcomes[0].rejections)).toContain('outside-opening-hours')
    expect(plan.applied).toEqual([])
  })

  it('refuses a slot that is not on the half hour', () => {
    const plan = planSeries(
      series({ repeatCount: 2, startMinute: at(0, 18, 10), endMinute: at(0, 19, 10) }),
      context(),
    )

    expect(codes(plan.outcomes[0].rejections)).toEqual(['zero-length'])
  })

  it('counts the allowance week by week, not across the whole series', () => {
    // Pia's 240 minutes are already spent in week 0, but every later week
    // starts her allowance again.
    const spent = booking({
      id: 'bk-pia',
      machineId: 'printer-b',
      memberId: PIA.id,
      startMinute: at(0, 13),
      endMinute: at(0, 17),
    })

    const definition = series({
      repeatCount: 3,
      machineId: 'printer-b',
      memberId: PIA.id,
      startMinute: at(0, 18),
      endMinute: at(0, 19),
    })

    const ctx = context({ machine: machine('printer-b'), member: PIA, existing: [spent] })

    expect(codes(planSeries(definition, ctx).outcomes[0].rejections)).toContain(
      'allowance-exceeded',
    )
    expect(acceptedWeeks(definition, ctx)).toEqual([1, 2])
  })

  it('lets another series hold the slot in the weeks it covers', () => {
    const other = series({ id: 'sr-0002', memberId: 'm-tomas', repeatCount: 2 })
    const ctx = context({ otherSeries: [other] })

    expect(acceptedWeeks(series({ repeatCount: 4 }), ctx)).toEqual([2, 3])
  })

  it('never treats a series as a clash with itself', () => {
    const definition = series({ repeatCount: 2 })
    const ctx = context({ otherSeries: [definition] })

    expect(acceptedWeeks(definition, ctx)).toEqual([0, 1])
  })

  it('counts another series of the same member against their allowance', () => {
    const other: SeriesDefinition = series({
      id: 'sr-0002',
      machineId: 'printer-b',
      memberId: PIA.id,
      startMinute: at(1, 13),
      endMinute: at(1, 17),
      repeatCount: 1,
    })

    const definition = series({
      repeatCount: 2,
      machineId: 'printer-b',
      memberId: PIA.id,
      startMinute: at(0, 18),
      endMinute: at(0, 19),
    })

    const ctx = context({
      machine: machine('printer-b'),
      member: PIA,
      otherSeries: [other],
    })

    // Only week 0 carries the other series, so only week 0 runs out of room.
    expect(codes(planSeries(definition, ctx).outcomes[0].rejections)).toContain(
      'allowance-exceeded',
    )
    expect(acceptedWeeks(definition, ctx)).toEqual([1])
  })

  it('honours opening hours passed in place of the workshop default', () => {
    const plan = planSeries(
      series({ repeatCount: 1 }),
      context({ hours: [{ day: 0, openMinute: 9 * 60, closeMinute: 12 * 60 }] }),
    )

    expect(codes(plan.outcomes[0].rejections)).toContain('outside-opening-hours')
  })
})

describe('all-or-nothing mode', () => {
  it('books nothing when a single week is refused', () => {
    const plan = planSeries(
      series({ repeatCount: 3, mode: 'all-or-nothing' }),
      context({ existing: [booking()] }),
    )

    expect(plan.outcomes.filter((outcome) => outcome.accepted)).toHaveLength(2)
    expect(plan.applied).toEqual([])
    expect(plan.ok).toBe(false)
  })

  it('books every week when none is refused', () => {
    const plan = planSeries(series({ repeatCount: 3, mode: 'all-or-nothing' }), context())

    expect(plan.applied).toHaveLength(3)
    expect(plan.ok).toBe(true)
  })
})

describe('summariseSeries', () => {
  const summaryOf = (definition: SeriesDefinition, ctx = context()) =>
    summariseSeries(planSeries(definition, ctx))

  it('says when every week fits', () => {
    const summary = summaryOf(series({ repeatCount: 4 }))

    expect(summary).toMatchObject({ total: 4, acceptedCount: 4, refusedCount: 0, bookedCount: 4 })
    expect(summary.text).toBe('All 4 weeks can be booked.')
    expect(summary.reasons).toEqual([])
  })

  it('speaks of a single week in the singular', () => {
    expect(summaryOf(series({ repeatCount: 1 })).text).toBe('That week can be booked.')
  })

  it('counts the weeks that were skipped', () => {
    const summary = summaryOf(series({ repeatCount: 3 }), context({ existing: [booking()] }))

    expect(summary.text).toBe('2 of 3 weeks can be booked, 1 refused.')
    expect(summary.acceptedCount).toBe(2)
    expect(summary.refusedCount).toBe(1)
  })

  it('says when nothing at all can be booked', () => {
    const summary = summaryOf(
      series({ repeatCount: 2, memberId: PIA.id }),
      context({ member: PIA }),
    )

    expect(summary.text).toBe('None of the 2 weeks can be booked.')
    expect(summary.bookedCount).toBe(0)
  })

  it('warns that all-or-nothing throws the accepted weeks away too', () => {
    const summary = summaryOf(
      series({ repeatCount: 3, mode: 'all-or-nothing' }),
      context({ existing: [booking()] }),
    )

    expect(summary.text).toBe('Nothing will be booked: 1 week of 3 refused.')
    expect(summary.acceptedCount).toBe(2)
    expect(summary.bookedCount).toBe(0)
  })

  it('asks for a repeat count when the series is empty', () => {
    const summary = summaryOf(series({ repeatCount: 0 }))

    expect(summary.text).toBe('No weeks to book — choose how often the slot repeats.')
    expect(summary.total).toBe(0)
  })

  it('gathers each distinct reason once, with how many weeks it hit', () => {
    const summary = summaryOf(
      series({ repeatCount: 3, memberId: PIA.id }),
      context({ member: PIA, existing: [booking()] }),
    )

    expect(summary.reasons.map((reason) => reason.code)).toEqual([
      'missing-ticket',
      'overlaps-booking',
    ])
    expect(summary.reasons[0]).toMatchObject({ count: 3 })
    expect(summary.reasons[0].message).toContain('Laser basic')
    expect(summary.reasons[1]).toMatchObject({ count: 1 })
  })
})
