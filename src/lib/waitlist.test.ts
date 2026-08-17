import { describe, expect, it } from 'vitest'

import { MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'
import { weekMinute } from '@/lib/weektime'
import {
  applyPromotion,
  checkEntry,
  compareQueue,
  draftFor,
  entriesForMember,
  entriesForSlot,
  entryFor,
  formatPosition,
  hasJoined,
  isBookableSlot,
  isSameSlot,
  joinWaitlist,
  leaveWaitlist,
  nextEntryId,
  nextJoinedAt,
  positionOf,
  queueLength,
  resolvePromotion,
  slotKey,
  sortQueue,
  WAITLIST_STORAGE_KEY,
  withoutEntries,
  type WaitlistEntry,
  type WaitlistSlot,
} from '@/lib/waitlist'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

/** Monday 18:00–19:00 on the big laser, which needs the laser sign-off. */
const SLOT: WaitlistSlot = {
  machineId: 'laser-a',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
}

const OTHER_SLOT: WaitlistSlot = {
  machineId: 'printer-b',
  startMinute: at(1, 18),
  endMinute: at(1, 19),
}

function entry(over: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'wl-0001',
    machineId: SLOT.machineId,
    memberId: 'm-ilra',
    startMinute: SLOT.startMinute,
    endMinute: SLOT.endMinute,
    note: '',
    joinedAt: 1,
    ...over,
  }
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'bk-0001',
    machineId: 'laser-a',
    memberId: 'm-tomas',
    startMinute: at(0, 18),
    endMinute: at(0, 19),
    note: '',
    createdAt: 0,
    ...over,
  }
}

describe('the storage key', () => {
  it('is versioned alongside the board', () => {
    expect(WAITLIST_STORAGE_KEY).toBe('benchclock:waitlist:v1')
  })
})

describe('slot identity', () => {
  it('matches a machine and time span exactly', () => {
    expect(isSameSlot(SLOT, { ...SLOT })).toBe(true)
    expect(isSameSlot(SLOT, { ...SLOT, machineId: 'laser-b' })).toBe(false)
    expect(isSameSlot(SLOT, { ...SLOT, endMinute: at(0, 20) })).toBe(false)
  })

  it('keys the machine and both ends of the span', () => {
    expect(slotKey(SLOT)).toBe(`laser-a:${at(0, 18)}:${at(0, 19)}`)
  })

  it('accepts only aligned, non-empty spans', () => {
    expect(isBookableSlot(SLOT)).toBe(true)
    expect(isBookableSlot({ ...SLOT, endMinute: SLOT.startMinute })).toBe(false)
    expect(isBookableSlot({ ...SLOT, endMinute: SLOT.startMinute - 30 })).toBe(false)
    expect(isBookableSlot({ ...SLOT, startMinute: SLOT.startMinute + 7 })).toBe(false)
  })
})

describe('queue ordering', () => {
  it('serves the earliest joiner first', () => {
    const queue = sortQueue([
      entry({ id: 'wl-0002', joinedAt: 9 }),
      entry({ id: 'wl-0003', joinedAt: 2 }),
    ])

    expect(queue.map((queued) => queued.id)).toEqual(['wl-0003', 'wl-0002'])
  })

  it('breaks a tie by id so the order never shuffles', () => {
    const queue = sortQueue([
      entry({ id: 'wl-0009', joinedAt: 4 }),
      entry({ id: 'wl-0002', joinedAt: 4 }),
    ])

    expect(queue.map((queued) => queued.id)).toEqual(['wl-0002', 'wl-0009'])
    expect(compareQueue(entry({ id: 'wl-1' }), entry({ id: 'wl-1' }))).toBe(0)
  })

  it('leaves the input array untouched', () => {
    const entries = [entry({ id: 'wl-0002', joinedAt: 9 }), entry({ id: 'wl-0001', joinedAt: 1 })]
    sortQueue(entries)

    expect(entries[0].id).toBe('wl-0002')
  })

  it('keeps each slot in its own queue', () => {
    const entries = [
      entry({ id: 'wl-0001' }),
      entry({ id: 'wl-0002', ...OTHER_SLOT, joinedAt: 2 }),
    ]

    expect(entriesForSlot(entries, SLOT).map((queued) => queued.id)).toEqual(['wl-0001'])
    expect(queueLength(entries, OTHER_SLOT)).toBe(1)
  })

  it('reports an empty queue for a slot nobody wants', () => {
    expect(entriesForSlot([], SLOT)).toEqual([])
    expect(queueLength([], SLOT)).toBe(0)
  })
})

describe('positions', () => {
  const entries = [
    entry({ id: 'wl-0001', memberId: 'm-ilra', joinedAt: 1 }),
    entry({ id: 'wl-0002', memberId: 'm-tomas', joinedAt: 2 }),
    entry({ id: 'wl-0003', memberId: 'm-nour', joinedAt: 3 }),
  ]

  it('counts from one within the entry\'s own slot', () => {
    expect(positionOf(entries, 'wl-0001')).toBe(1)
    expect(positionOf(entries, 'wl-0003')).toBe(3)
  })

  it('ignores queues for other slots', () => {
    const mixed = [...entries, entry({ id: 'wl-0004', ...OTHER_SLOT, joinedAt: 0 })]

    expect(positionOf(mixed, 'wl-0004')).toBe(1)
    expect(positionOf(mixed, 'wl-0001')).toBe(1)
  })

  it('reports zero for an entry that is not queued', () => {
    expect(positionOf(entries, 'wl-9999')).toBe(0)
    expect(positionOf([], 'wl-0001')).toBe(0)
  })

  it('renumbers everyone behind a member who leaves mid-queue', () => {
    const left = leaveWaitlist(entries, 'wl-0002')

    expect(positionOf(left, 'wl-0001')).toBe(1)
    expect(positionOf(left, 'wl-0003')).toBe(2)
    expect(positionOf(left, 'wl-0002')).toBe(0)
  })

  it('states the position in words', () => {
    expect(formatPosition(2, 4)).toBe('Position 2 of 4')
  })
})

describe('joining', () => {
  it('adds a member to the back of the queue', () => {
    const first = joinWaitlist([], { ...SLOT, memberId: 'm-ilra' })
    expect(first.ok).toBe(true)

    const second = joinWaitlist(first.entries, { ...SLOT, memberId: 'm-tomas' })
    expect(second.ok).toBe(true)
    expect(second.entries.map((queued) => queued.memberId)).toEqual(['m-ilra', 'm-tomas'])
    expect(positionOf(second.entries, second.ok ? second.entry.id : '')).toBe(2)
  })

  it('mints sequential ids and join numbers', () => {
    const first = joinWaitlist([], { ...SLOT, memberId: 'm-ilra' })
    const second = joinWaitlist(first.entries, { ...SLOT, memberId: 'm-tomas' })

    expect(first.ok && first.entry.id).toBe('wl-0001')
    expect(second.ok && second.entry.id).toBe('wl-0002')
    expect(second.ok && second.entry.joinedAt).toBe(2)
  })

  it('continues the sequence after a restored queue', () => {
    const entries = [entry({ id: 'wl-0042', joinedAt: 42 })]

    expect(nextEntryId(entries)).toBe('wl-0043')
    expect(nextJoinedAt(entries)).toBe(43)
    expect(nextEntryId([entry({ id: 'not-a-sequence-id' })])).toBe('wl-0001')
    expect(nextJoinedAt([])).toBe(1)
  })

  it('trims the note and defaults it to empty', () => {
    const withNote = joinWaitlist([], { ...SLOT, memberId: 'm-ilra', note: '  Lamp base  ' })
    const without = joinWaitlist([], { ...SLOT, memberId: 'm-tomas' })

    expect(withNote.ok && withNote.entry.note).toBe('Lamp base')
    expect(without.ok && without.entry.note).toBe('')
  })

  it('refuses a second place in the same queue', () => {
    const first = joinWaitlist([], { ...SLOT, memberId: 'm-ilra' })
    const again = joinWaitlist(first.entries, { ...SLOT, memberId: 'm-ilra' })

    expect(again.ok).toBe(false)
    expect(again.ok === false && again.reason).toBe('duplicate')
    expect(again.entries).toHaveLength(1)
  })

  it('lets the same member wait for a different slot', () => {
    const first = joinWaitlist([], { ...SLOT, memberId: 'm-ilra' })
    const other = joinWaitlist(first.entries, { ...OTHER_SLOT, memberId: 'm-ilra' })

    expect(other.ok).toBe(true)
    expect(other.entries).toHaveLength(2)
  })

  it('refuses a slot that could never be booked', () => {
    const result = joinWaitlist([], { ...SLOT, endMinute: SLOT.startMinute, memberId: 'm-ilra' })

    expect(result.ok === false && result.reason).toBe('malformed-slot')
    expect(result.entries).toEqual([])
  })

  it('does not mutate the queue it was given', () => {
    const entries = [entry()]
    joinWaitlist(entries, { ...SLOT, memberId: 'm-tomas' })

    expect(entries).toHaveLength(1)
  })

  it('answers whether a member is already waiting', () => {
    const entries = [entry({ memberId: 'm-ilra' })]

    expect(hasJoined(entries, SLOT, 'm-ilra')).toBe(true)
    expect(hasJoined(entries, SLOT, 'm-pia')).toBe(false)
    expect(hasJoined(entries, OTHER_SLOT, 'm-ilra')).toBe(false)
    expect(entryFor(entries, SLOT, 'm-ilra')?.id).toBe('wl-0001')
    expect(entryFor(entries, SLOT, 'm-pia')).toBeUndefined()
  })
})

describe('leaving', () => {
  it('removes only the named entry', () => {
    const entries = [entry({ id: 'wl-0001' }), entry({ id: 'wl-0002', joinedAt: 2 })]

    expect(leaveWaitlist(entries, 'wl-0001').map((queued) => queued.id)).toEqual(['wl-0002'])
  })

  it('is a no-op for an entry that is not queued', () => {
    const entries = [entry()]

    expect(leaveWaitlist(entries, 'wl-9999')).toHaveLength(1)
    expect(leaveWaitlist([], 'wl-0001')).toEqual([])
  })

  it('removes a whole set at once', () => {
    const entries = [
      entry({ id: 'wl-0001' }),
      entry({ id: 'wl-0002', joinedAt: 2 }),
      entry({ id: 'wl-0003', joinedAt: 3 }),
    ]

    expect(withoutEntries(entries, ['wl-0001', 'wl-0003']).map((q) => q.id)).toEqual(['wl-0002'])
  })
})

describe('what a member is waiting for', () => {
  it('lists only their own entries, earliest slot first', () => {
    const entries = [
      entry({ id: 'wl-0001', memberId: 'm-ilra', ...OTHER_SLOT, joinedAt: 1 }),
      entry({ id: 'wl-0002', memberId: 'm-tomas', joinedAt: 2 }),
      entry({ id: 'wl-0003', memberId: 'm-ilra', joinedAt: 3 }),
    ]

    expect(entriesForMember(entries, 'm-ilra').map((q) => q.id)).toEqual(['wl-0003', 'wl-0001'])
    expect(entriesForMember(entries, 'm-pia')).toEqual([])
  })

  it('falls back to join order when two slots start together', () => {
    const entries = [
      entry({ id: 'wl-0002', machineId: 'laser-b', joinedAt: 2 }),
      entry({ id: 'wl-0001', joinedAt: 1 }),
    ]

    expect(entriesForMember(entries, 'm-ilra').map((q) => q.id)).toEqual(['wl-0001', 'wl-0002'])
  })
})

describe('eligibility at promotion time', () => {
  it('turns an entry into the booking it would become', () => {
    expect(draftFor(entry({ note: 'Lamp base' }))).toEqual({
      machineId: 'laser-a',
      memberId: 'm-ilra',
      startMinute: at(0, 18),
      endMinute: at(0, 19),
      note: 'Lamp base',
    })
  })

  it('passes a member who still qualifies', () => {
    expect(checkEntry(entry(), { bookings: [] })).toEqual([])
  })

  it('reports the rules\' own reasons', () => {
    const rejections = checkEntry(entry({ memberId: 'm-pia' }), { bookings: [] })

    expect(rejections.map((r) => r.code)).toContain('missing-ticket')
  })

  it('refuses a machine or member that has left the workshop', () => {
    expect(checkEntry(entry({ machineId: 'gone' }), { bookings: [] })[0].code).toBe(
      'out-of-service',
    )
    expect(checkEntry(entry({ memberId: 'gone' }), { bookings: [] })).toHaveLength(1)
  })

  it('checks against the board as it stands after the cancellation', () => {
    const clash = booking({ memberId: 'm-tomas' })

    expect(checkEntry(entry(), { bookings: [clash] }).map((r) => r.code)).toContain(
      'overlaps-booking',
    )
    expect(checkEntry(entry(), { bookings: [] })).toEqual([])
  })

  it('honours injected machines, members, and opening hours', () => {
    const laser = MACHINES_BY_ID.get('laser-a')
    if (!laser) throw new Error('no machine laser-a')

    const machines = new Map(MACHINES_BY_ID)
    machines.set('laser-a', { ...laser, outOfService: true })

    expect(
      checkEntry(entry(), { bookings: [], machines, members: MEMBERS_BY_ID }).map((r) => r.code),
    ).toContain('out-of-service')

    expect(
      checkEntry(entry(), {
        bookings: [],
        hours: [{ day: 0, openMinute: at(0, 20), closeMinute: at(0, 22) }],
      }).map((r) => r.code),
    ).toContain('outside-opening-hours')
  })
})

describe('promotion', () => {
  it('promotes nobody from an empty queue', () => {
    expect(resolvePromotion([], SLOT, { bookings: [] })).toEqual({ promoted: null, skipped: [] })
  })

  it('promotes the first joiner when they still qualify', () => {
    const entries = [
      entry({ id: 'wl-0001', memberId: 'm-ilra', joinedAt: 1 }),
      entry({ id: 'wl-0002', memberId: 'm-tomas', joinedAt: 2 }),
    ]

    const outcome = resolvePromotion(entries, SLOT, { bookings: [] })

    expect(outcome.promoted?.id).toBe('wl-0001')
    expect(outcome.skipped).toEqual([])
  })

  it('skips the head of the queue when they no longer qualify', () => {
    const entries = [
      // Pia holds no laser sign-off, so the slot passes to Tomas behind her.
      entry({ id: 'wl-0001', memberId: 'm-pia', joinedAt: 1 }),
      entry({ id: 'wl-0002', memberId: 'm-tomas', joinedAt: 2 }),
    ]

    const outcome = resolvePromotion(entries, SLOT, { bookings: [] })

    expect(outcome.promoted?.memberId).toBe('m-tomas')
    expect(outcome.skipped).toHaveLength(1)
    expect(outcome.skipped[0].entry.id).toBe('wl-0001')
    expect(outcome.skipped[0].rejections.map((r) => r.code)).toContain('missing-ticket')
  })

  it('skips everyone when nobody qualifies', () => {
    const entries = [
      entry({ id: 'wl-0001', memberId: 'm-pia', joinedAt: 1 }),
      entry({ id: 'wl-0002', memberId: 'm-nour', joinedAt: 2 }),
    ]

    const outcome = resolvePromotion(entries, SLOT, { bookings: [] })

    expect(outcome.promoted).toBeNull()
    expect(outcome.skipped.map((skip) => skip.entry.id)).toEqual(['wl-0001', 'wl-0002'])
  })

  it('skips a waiting member who has since spent their allowance', () => {
    const entries = [
      entry({ id: 'wl-0001', memberId: 'm-ilra', joinedAt: 1 }),
      entry({ id: 'wl-0002', memberId: 'm-tomas', joinedAt: 2 }),
    ]
    // Ilra filled her whole 900-minute week elsewhere while she waited.
    const bookings = [at(5, 9), at(5, 14), at(6, 10)].map((start, index) =>
      booking({
        id: `bk-full-${index}`,
        machineId: 'printer-b',
        memberId: 'm-ilra',
        startMinute: start,
        endMinute: start + 300,
      }),
    )

    const outcome = resolvePromotion(entries, SLOT, { bookings })

    expect(outcome.promoted?.memberId).toBe('m-tomas')
    expect(outcome.skipped[0].rejections.map((r) => r.code)).toContain('allowance-exceeded')
  })

  it('leaves other slots\' queues out of it', () => {
    const entries = [
      entry({ id: 'wl-0001', ...OTHER_SLOT, memberId: 'm-pia', joinedAt: 1 }),
      entry({ id: 'wl-0002', memberId: 'm-tomas', joinedAt: 2 }),
    ]

    const outcome = resolvePromotion(entries, SLOT, { bookings: [] })

    expect(outcome.promoted?.id).toBe('wl-0002')
    expect(outcome.skipped).toEqual([])
  })

  it('clears the promoted and skipped entries, keeping the rest waiting', () => {
    const entries = [
      entry({ id: 'wl-0001', memberId: 'm-pia', joinedAt: 1 }),
      entry({ id: 'wl-0002', memberId: 'm-tomas', joinedAt: 2 }),
      entry({ id: 'wl-0003', memberId: 'm-nour', joinedAt: 3 }),
      entry({ id: 'wl-0004', ...OTHER_SLOT, memberId: 'm-pia', joinedAt: 4 }),
    ]

    const outcome = resolvePromotion(entries, SLOT, { bookings: [] })
    const left = applyPromotion(entries, outcome)

    expect(left.map((queued) => queued.id)).toEqual(['wl-0003', 'wl-0004'])
    expect(positionOf(left, 'wl-0003')).toBe(1)
  })

  it('keeps the queue intact when nobody could be promoted', () => {
    const entries = [entry({ id: 'wl-0001', ...OTHER_SLOT })]
    const outcome = resolvePromotion(entries, SLOT, { bookings: [] })

    expect(applyPromotion(entries, outcome)).toHaveLength(1)
  })
})
