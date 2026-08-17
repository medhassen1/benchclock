import { describe, expect, it } from 'vitest'

import { INDUCTIONS, INDUCTIONS_BY_ID, type Induction } from '@/data/inductions'
import { MEMBERS_BY_ID } from '@/data/workshop'
import {
  canEnrol,
  enrolmentBlockers,
  enrolmentsForMember,
  fillFraction,
  inductionsNeededBy,
  isEnrolled,
  isFull,
  machinesUnlockedBy,
  nextJoinableInduction,
  openInductionsFor,
  seatsInWords,
  seatsRemaining,
  seatsTaken,
  ticketsNeededFor,
  type Enrolment,
} from '@/lib/inductions'
import { weekMinute } from '@/lib/weektime'
import type { Booking, Member } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const member = (id: string): Member => {
  const found = MEMBERS_BY_ID.get(id)
  if (!found) throw new Error(`no member ${id}`)
  return found
}

const induction = (id: string): Induction => {
  const found = INDUCTIONS_BY_ID.get(id)
  if (!found) throw new Error(`no induction ${id}`)
  return found
}

/** Ilra holds laser, both CNC tickets and metalwork, but not textiles. */
const ILRA = member('m-ilra')
/** Pia holds no sign-offs at all. */
const PIA = member('m-pia')

const LASER_MON = induction('ind-laser-mon')
/** Two seats only, which makes filling it cheap in a test. */
const TEXTILES_SUN = induction('ind-textiles-sun')

const seats = (inductionId: string, memberIds: readonly string[]): Enrolment[] =>
  memberIds.map((memberId) => ({ inductionId, memberId }))

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-1',
  machineId: 'printer-b',
  memberId: PIA.id,
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  createdAt: 0,
  ...over,
})

describe('the fixture timetable', () => {
  it('gives every session a positive length and at least one seat', () => {
    for (const entry of INDUCTIONS) {
      expect(entry.endMinute).toBeGreaterThan(entry.startMinute)
      expect(entry.capacity).toBeGreaterThan(0)
    }
  })

  it('uses a unique id per session', () => {
    expect(INDUCTIONS_BY_ID.size).toBe(INDUCTIONS.length)
  })
})

describe('what a ticket unlocks', () => {
  it('lists the machines that ask for it', () => {
    expect(machinesUnlockedBy('laser-basic').map((m) => m.id)).toEqual(['laser-a', 'laser-b'])
    expect(machinesUnlockedBy('metalwork').map((m) => m.id)).toEqual(['lathe-a', 'welder-a'])
  })

  it('unlocks nothing when no machine requires the ticket', () => {
    expect(machinesUnlockedBy('cnc-basic')).toEqual([])
  })
})

describe('sign-offs a member still needs', () => {
  it('names only the ones they are missing', () => {
    expect(ticketsNeededFor(PIA, ['laser-a', 'sewing-a'])).toEqual(['laser-basic', 'textiles'])
  })

  it('ignores machines they can already book', () => {
    expect(ticketsNeededFor(ILRA, ['laser-a', 'cnc-a', 'lathe-a'])).toEqual([])
  })

  it('ignores machines that need no sign-off', () => {
    expect(ticketsNeededFor(PIA, ['printer-a', 'printer-b'])).toEqual([])
  })

  it('names a shared ticket once, however many machines ask for it', () => {
    expect(ticketsNeededFor(PIA, ['laser-a', 'laser-b'])).toEqual(['laser-basic'])
  })

  it('ignores a machine id that is not on the roster', () => {
    expect(ticketsNeededFor(PIA, ['ghost-machine'])).toEqual([])
  })
})

describe('sessions a member needs', () => {
  it('offers every session granting a missing ticket, earliest first', () => {
    const needed = inductionsNeededBy(PIA, ['laser-a', 'sewing-a'])

    expect(needed.map((entry) => entry.id)).toEqual([
      'ind-laser-mon',
      'ind-textiles-fri',
      'ind-laser-sat',
      'ind-textiles-sun',
    ])
  })

  it('offers nothing to a member who is already signed off', () => {
    expect(inductionsNeededBy(ILRA, ['laser-a'])).toEqual([])
  })

  it('leaves the source timetable untouched when sorting', () => {
    const before = INDUCTIONS.map((entry) => entry.id)
    inductionsNeededBy(PIA, ['laser-a'])

    expect(INDUCTIONS.map((entry) => entry.id)).toEqual(before)
  })

  it('lists every unheld sign-off when no machine is named', () => {
    expect(openInductionsFor(ILRA).map((entry) => entry.id)).toEqual([
      'ind-textiles-fri',
      'ind-textiles-sun',
    ])
  })
})

describe('seats on a session', () => {
  it('counts only the seats on that session', () => {
    const enrolments = [...seats(LASER_MON.id, ['m-pia', 'm-tomas']), ...seats('ind-laser-sat', ['m-nour'])]

    expect(seatsTaken(LASER_MON.id, enrolments)).toBe(2)
    expect(seatsRemaining(LASER_MON, enrolments)).toBe(4)
    expect(isFull(LASER_MON, enrolments)).toBe(false)
  })

  it('reports a session with every seat taken as full', () => {
    const enrolments = seats(TEXTILES_SUN.id, ['m-pia', 'm-tomas'])

    expect(seatsRemaining(TEXTILES_SUN, enrolments)).toBe(0)
    expect(isFull(TEXTILES_SUN, enrolments)).toBe(true)
  })

  it('never reports fewer than no seats, even when over-filled', () => {
    const enrolments = seats(TEXTILES_SUN.id, ['m-pia', 'm-tomas', 'm-nour', 'm-ilra'])

    expect(seatsRemaining(TEXTILES_SUN, enrolments)).toBe(0)
  })

  it('treats a session with no capacity as full rather than dividing by zero', () => {
    const empty: Induction = { ...TEXTILES_SUN, capacity: 0 }

    expect(fillFraction(empty, [])).toBe(1)
    expect(isFull(empty, [])).toBe(true)
  })

  it('caps the fill fraction at one', () => {
    const enrolments = seats(TEXTILES_SUN.id, ['m-pia', 'm-tomas', 'm-nour'])

    expect(fillFraction(TEXTILES_SUN, enrolments)).toBe(1)
    expect(fillFraction(TEXTILES_SUN, [])).toBe(0)
  })

  it('finds the seats one member holds', () => {
    const enrolments = [...seats(LASER_MON.id, ['m-pia']), ...seats('ind-laser-sat', ['m-pia', 'm-nour'])]

    expect(enrolmentsForMember('m-pia', enrolments)).toHaveLength(2)
    expect(enrolmentsForMember('m-nour', enrolments)).toHaveLength(1)
    expect(enrolmentsForMember('m-tomas', enrolments)).toEqual([])
  })

  it('states remaining capacity in words', () => {
    expect(seatsInWords(0)).toBe('No seats left')
    expect(seatsInWords(1)).toBe('One seat left')
    expect(seatsInWords(4)).toBe('Four seats left')
    expect(seatsInWords(-3)).toBe('No seats left')
    expect(seatsInWords(40)).toBe('40 seats left')
  })
})

describe('enrolment eligibility', () => {
  it('lets a member with no sign-off take a free seat', () => {
    const context = { induction: LASER_MON, member: PIA, enrolments: [], bookings: [] }

    expect(enrolmentBlockers(context)).toEqual([])
    expect(canEnrol(context)).toBe(true)
  })

  it('refuses a member who already holds the sign-off', () => {
    const blockers = enrolmentBlockers({ induction: LASER_MON, member: ILRA, enrolments: [] })

    expect(blockers.map((entry) => entry.code)).toEqual(['already-held'])
    expect(blockers[0].message).toContain('Laser basic')
  })

  it('refuses a member who already has a seat, and says nothing else', () => {
    const enrolments = seats(TEXTILES_SUN.id, ['m-pia', 'm-tomas'])
    const blockers = enrolmentBlockers({ induction: TEXTILES_SUN, member: PIA, enrolments })

    // The session is full, but only because of her own seat.
    expect(blockers.map((entry) => entry.code)).toEqual(['already-enrolled'])
    expect(isEnrolled(TEXTILES_SUN.id, PIA.id, enrolments)).toBe(true)
  })

  it('refuses a full session', () => {
    const enrolments = seats(TEXTILES_SUN.id, ['m-tomas', 'm-nour'])
    const blockers = enrolmentBlockers({ induction: TEXTILES_SUN, member: PIA, enrolments })

    expect(blockers.map((entry) => entry.code)).toEqual(['session-full'])
    expect(blockers[0].message).toContain('2 of 2 seats taken')
  })

  it('refuses a session clashing with one of their own bookings', () => {
    const clash = booking({ id: 'bk-clash', startMinute: at(0, 19), endMinute: at(0, 21) })
    const blockers = enrolmentBlockers({
      induction: LASER_MON,
      member: PIA,
      enrolments: [],
      bookings: [clash],
    })

    expect(blockers.map((entry) => entry.code)).toEqual(['clashes-booking'])
    expect(blockers[0].conflictIds).toEqual(['bk-clash'])
    expect(blockers[0].message).toContain('Mon 19:00')
  })

  it('ignores a booking that merely touches the session end to end', () => {
    const touching = booking({ startMinute: at(0, 20), endMinute: at(0, 21) })

    expect(
      canEnrol({ induction: LASER_MON, member: PIA, enrolments: [], bookings: [touching] }),
    ).toBe(true)
  })

  it('ignores another member\'s clashing booking', () => {
    const other = booking({ memberId: 'm-tomas', startMinute: at(0, 18), endMinute: at(0, 19) })

    expect(
      canEnrol({ induction: LASER_MON, member: PIA, enrolments: [], bookings: [other] }),
    ).toBe(true)
  })

  it('reports every reason at once when several apply', () => {
    const enrolments = seats(TEXTILES_SUN.id, ['m-tomas', 'm-nour'])
    const clash = booking({ memberId: 'm-ilra', startMinute: at(6, 11), endMinute: at(6, 12) })
    const blockers = enrolmentBlockers({
      induction: TEXTILES_SUN,
      member: ILRA,
      enrolments,
      bookings: [clash],
    })

    expect(blockers.map((entry) => entry.code)).toEqual(['session-full', 'clashes-booking'])
  })
})

describe('finding a session to join', () => {
  it('picks the earliest one the member can actually take', () => {
    expect(nextJoinableInduction('laser-basic', PIA, [])?.id).toBe('ind-laser-mon')
  })

  it('skips a full session for the next one granting the same ticket', () => {
    const enrolments = seats('ind-laser-mon', ['m-tomas', 'm-nour', 'm-ilra', 'a', 'b', 'c'])

    expect(nextJoinableInduction('laser-basic', PIA, enrolments)?.id).toBe('ind-laser-sat')
  })

  it('skips a session clashing with a booking', () => {
    const clash = booking({ startMinute: at(0, 18), endMinute: at(0, 19) })

    expect(nextJoinableInduction('laser-basic', PIA, [], [clash])?.id).toBe('ind-laser-sat')
  })

  it('finds nothing when the member already holds the ticket', () => {
    expect(nextJoinableInduction('metalwork', ILRA, [])).toBeUndefined()
  })
})
