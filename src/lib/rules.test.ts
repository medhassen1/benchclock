import { describe, expect, it } from 'vitest'

import { MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'
import { allowanceUsage, findRejections, isAllowed, minutesBookedBy } from '@/lib/rules'
import { weekMinute } from '@/lib/weektime'
import type { Booking, BookingDraft, Machine, Member, RejectionCode } from '@/types'

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

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'b-existing',
    machineId: 'laser-a',
    memberId: 'm-tomas',
    startMinute: at(0, 18),
    endMinute: at(0, 19),
    note: '',
    createdAt: 0,
    ...over,
  }
}

function draft(over: Partial<BookingDraft> = {}): BookingDraft {
  return {
    machineId: 'laser-a',
    memberId: ILRA.id,
    startMinute: at(0, 19),
    endMinute: at(0, 20),
    note: '',
    ...over,
  }
}

const codes = (rejections: { code: RejectionCode }[]) => rejections.map((r) => r.code)

describe('a valid booking', () => {
  it('is accepted', () => {
    const result = findRejections(draft(), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [],
    })

    expect(result).toEqual([])
    expect(isAllowed(draft(), { machine: machine('laser-a'), member: ILRA, existing: [] })).toBe(
      true,
    )
  })

  it('may start exactly when another booking ends', () => {
    const result = findRejections(draft({ machineId: 'lathe-a', startMinute: at(0, 19) }), {
      machine: machine('lathe-a'),
      member: ILRA,
      existing: [booking({ machineId: 'lathe-a', endMinute: at(0, 19) })],
    })

    expect(result).toEqual([])
  })
})

describe('machine availability', () => {
  it('refuses a machine that is out of service', () => {
    const result = findRejections(draft({ machineId: 'welder-a' }), {
      machine: machine('welder-a'),
      member: ILRA,
      existing: [],
    })

    expect(codes(result)).toContain('out-of-service')
  })
})

describe('sign-offs', () => {
  it('refuses a member without the required ticket', () => {
    const result = findRejections(draft({ memberId: PIA.id }), {
      machine: machine('laser-a'),
      member: PIA,
      existing: [],
    })

    expect(codes(result)).toContain('missing-ticket')
    expect(result[0].message).toContain('Laser basic')
  })

  it('allows a machine that needs no ticket', () => {
    const result = findRejections(draft({ machineId: 'printer-b', memberId: PIA.id }), {
      machine: machine('printer-b'),
      member: PIA,
      existing: [],
    })

    expect(result).toEqual([])
  })

  it('does not accept a near-miss ticket', () => {
    const result = findRejections(draft({ machineId: 'cnc-a', memberId: 'm-tomas' }), {
      machine: machine('cnc-a'),
      member: member('m-tomas'),
      existing: [],
    })

    expect(codes(result)).toContain('missing-ticket')
  })
})

describe('interval shape', () => {
  it.each([
    ['zero length', { endMinute: at(0, 19) }],
    ['reversed', { startMinute: at(0, 20), endMinute: at(0, 19) }],
    ['off the slot grid', { startMinute: at(0, 19, 10), endMinute: at(0, 20) }],
  ])('refuses a %s interval', (_label, over) => {
    const result = findRejections(draft(over), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [],
    })

    expect(codes(result)).toContain('zero-length')
  })

  it('stops checking once the interval is malformed', () => {
    const result = findRejections(draft({ startMinute: at(0, 20), endMinute: at(0, 19) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [booking()],
    })

    expect(codes(result)).toEqual(['zero-length'])
  })
})

describe('opening hours', () => {
  it('refuses a booking before opening', () => {
    const result = findRejections(draft({ startMinute: at(0, 9), endMinute: at(0, 10) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [],
    })

    expect(codes(result)).toContain('outside-opening-hours')
  })

  it('refuses a booking running past closing', () => {
    const result = findRejections(draft({ startMinute: at(0, 21), endMinute: at(0, 23) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [],
    })

    expect(codes(result)).toContain('outside-opening-hours')
  })

  it('allows a booking ending exactly at closing', () => {
    const result = findRejections(draft({ startMinute: at(0, 21), endMinute: at(0, 22) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [],
    })

    expect(result).toEqual([])
  })
})

describe('session length', () => {
  it('refuses a booking longer than the machine allows', () => {
    const result = findRejections(draft({ startMinute: at(5, 9), endMinute: at(5, 12) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [],
    })

    expect(codes(result)).toContain('too-long')
  })

  it('allows one exactly at the limit', () => {
    const result = findRejections(draft({ startMinute: at(5, 9), endMinute: at(5, 11) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [],
    })

    expect(result).toEqual([])
  })
})

describe('clashes', () => {
  it('refuses an overlapping booking and names the conflict', () => {
    const existing = booking({ id: 'b-1' })
    const result = findRejections(draft({ startMinute: at(0, 18, 30), endMinute: at(0, 19, 30) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [existing],
    })

    expect(codes(result)).toContain('overlaps-booking')
    expect(result.find((r) => r.code === 'overlaps-booking')?.conflictIds).toEqual(['b-1'])
  })

  it('ignores bookings on other machines', () => {
    const result = findRejections(draft({ machineId: 'printer-b' }), {
      machine: machine('printer-b'),
      member: ILRA,
      existing: [booking({ machineId: 'laser-a', startMinute: at(0, 19), endMinute: at(0, 20) })],
    })

    expect(result).toEqual([])
  })

  it('ignores the booking being edited', () => {
    const existing = booking({ id: 'b-self', machineId: 'lathe-a', memberId: ILRA.id })
    const result = findRejections(
      draft({ machineId: 'lathe-a', startMinute: existing.startMinute, endMinute: at(0, 19, 30) }),
      {
        machine: machine('lathe-a'),
        member: ILRA,
        existing: [existing],
        ignoreBookingId: 'b-self',
      },
    )

    expect(result).toEqual([])
  })
})

describe('cool-down', () => {
  it('rejects an unaligned start before it ever reaches the cool-down check', () => {
    const result = findRejections(draft({ startMinute: at(0, 19, 15), endMinute: at(0, 20) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [booking({ id: 'b-1', endMinute: at(0, 19) })],
    })

    expect(codes(result)).toEqual(['zero-length'])
  })

  it('refuses a booking starting the moment the previous one ends', () => {
    const result = findRejections(draft({ startMinute: at(0, 19), endMinute: at(0, 20) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [booking({ id: 'b-1', endMinute: at(0, 19) })],
    })

    expect(codes(result)).toContain('ignores-cooldown')
    expect(result.find((r) => r.code === 'ignores-cooldown')?.conflictIds).toEqual(['b-1'])
  })

  it('allows a gap exactly equal to the cool-down', () => {
    const result = findRejections(draft({ startMinute: at(0, 19, 30), endMinute: at(0, 20, 30) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [booking({ id: 'b-1', endMinute: at(0, 19) })],
    })

    expect(result).toEqual([])
  })

  it('allows a booking once the cool-down has passed', () => {
    const result = findRejections(draft({ startMinute: at(0, 19, 30), endMinute: at(0, 20, 30) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [booking({ id: 'b-1', endMinute: at(0, 18, 30) })],
    })

    expect(result).toEqual([])
  })

  it('does not apply to machines without a cool-down', () => {
    const result = findRejections(
      draft({ machineId: 'lathe-a', startMinute: at(0, 19), endMinute: at(0, 20) }),
      {
        machine: machine('lathe-a'),
        member: ILRA,
        existing: [booking({ machineId: 'lathe-a', endMinute: at(0, 19) })],
      },
    )

    expect(result).toEqual([])
  })

  it('reports the overlap rather than the cool-down when both apply', () => {
    const result = findRejections(draft({ startMinute: at(0, 18, 30), endMinute: at(0, 19, 30) }), {
      machine: machine('laser-a'),
      member: ILRA,
      existing: [booking({ id: 'b-1' })],
    })

    expect(codes(result)).toContain('overlaps-booking')
    expect(codes(result)).not.toContain('ignores-cooldown')
  })
})

describe('weekly allowance', () => {
  it('refuses a booking that would exceed it', () => {
    // Pia has 240 minutes; 210 are already used.
    const existing = [
      booking({ id: 'b-1', machineId: 'printer-b', memberId: PIA.id, endMinute: at(0, 21, 30) }),
    ]
    const result = findRejections(
      draft({
        machineId: 'printer-b',
        memberId: PIA.id,
        startMinute: at(1, 18),
        endMinute: at(1, 20),
      }),
      { machine: machine('printer-b'), member: PIA, existing },
    )

    expect(codes(result)).toContain('allowance-exceeded')
    expect(result.find((r) => r.code === 'allowance-exceeded')?.message).toContain('30 m left')
  })

  it('allows a booking that lands exactly on the allowance', () => {
    const existing = [
      booking({ id: 'b-1', machineId: 'printer-b', memberId: PIA.id, endMinute: at(0, 20) }),
    ]
    const result = findRejections(
      draft({
        machineId: 'printer-b',
        memberId: PIA.id,
        startMinute: at(1, 18),
        endMinute: at(1, 20),
      }),
      { machine: machine('printer-b'), member: PIA, existing },
    )

    expect(result).toEqual([])
  })

  it("counts only the member's own bookings", () => {
    const existing = [
      booking({ id: 'b-1', machineId: 'printer-b', memberId: 'm-tomas', endMinute: at(0, 22) }),
    ]
    const result = findRejections(
      draft({
        machineId: 'printer-b',
        memberId: PIA.id,
        startMinute: at(1, 18),
        endMinute: at(1, 20),
      }),
      { machine: machine('printer-b'), member: PIA, existing },
    )

    expect(codes(result)).not.toContain('allowance-exceeded')
  })
})

describe('multiple failures', () => {
  it('reports every applicable reason', () => {
    const result = findRejections(
      draft({ machineId: 'welder-a', memberId: PIA.id, startMinute: at(0, 9), endMinute: at(0, 12) }),
      { machine: machine('welder-a'), member: PIA, existing: [] },
    )

    expect(codes(result)).toEqual(
      expect.arrayContaining(['out-of-service', 'missing-ticket', 'outside-opening-hours', 'too-long']),
    )
  })
})

describe('usage helpers', () => {
  it("totals a member's booked minutes", () => {
    const bookings = [
      booking({ id: 'b-1', memberId: PIA.id, endMinute: at(0, 19) }),
      booking({ id: 'b-2', memberId: PIA.id, startMinute: at(1, 18), endMinute: at(1, 20) }),
      booking({ id: 'b-3', memberId: 'm-tomas' }),
    ]

    expect(minutesBookedBy(PIA.id, bookings)).toBe(180)
  })

  it('reports usage as a clamped fraction', () => {
    const bookings = [booking({ id: 'b-1', memberId: PIA.id, endMinute: at(0, 20) })]

    expect(allowanceUsage(PIA, bookings)).toEqual({
      used: 120,
      allowance: 240,
      remaining: 120,
      fraction: 0.5,
    })
  })

  it('never reports more than a full bar or negative remaining time', () => {
    const bookings = [
      booking({ id: 'b-1', memberId: PIA.id, startMinute: at(5, 9), endMinute: at(5, 19) }),
    ]
    const usage = allowanceUsage(PIA, bookings)

    expect(usage.fraction).toBe(1)
    expect(usage.remaining).toBe(0)
  })
})
