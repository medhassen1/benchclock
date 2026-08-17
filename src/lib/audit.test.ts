import { describe, expect, it } from 'vitest'

import {
  appendAuditEntry,
  auditSequenceOf,
  compareAuditEntries,
  describeAuditSubject,
  epochDay,
  filterAuditEntries,
  formatAuditEntry,
  formatAuditId,
  formatAuditTime,
  formatDayKey,
  formatDayLabel,
  groupAuditEntriesByDay,
  highestAuditSequence,
  isAuditAction,
  isAuditEntry,
  sortAuditEntries,
  weekdayOf,
  type AuditEntry,
} from '@/lib/audit'

/** 17 August 2026, 18:04 UTC. */
const MONDAY = 1_786_989_840_000
/** The following day, 00:30 UTC. */
const TUESDAY = 1_787_013_000_000

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'au-0001',
  actorId: 'm-ilra',
  action: 'booking-created',
  subject: 'laser-a',
  details: 'Mon 18:00 – 19:00',
  at: MONDAY,
  ...over,
})

describe('schema guards', () => {
  it('recognises the known actions only', () => {
    expect(isAuditAction('booking-created')).toBe(true)
    expect(isAuditAction('bookings-imported')).toBe(true)
    expect(isAuditAction('booking-deleted')).toBe(false)
    expect(isAuditAction(7)).toBe(false)
  })

  it('accepts a complete entry', () => {
    expect(isAuditEntry(entry())).toBe(true)
  })

  it('rejects entries that are missing or mistyped', () => {
    expect(isAuditEntry(null)).toBe(false)
    expect(isAuditEntry('au-0001')).toBe(false)
    expect(isAuditEntry({ ...entry(), id: 1 })).toBe(false)
    expect(isAuditEntry({ ...entry(), action: 'nonsense' })).toBe(false)
    expect(isAuditEntry({ ...entry(), details: undefined })).toBe(false)
    expect(isAuditEntry({ ...entry(), at: Number.NaN })).toBe(false)
  })
})

describe('ids', () => {
  it('formats zero-padded ids', () => {
    expect(formatAuditId(1)).toBe('au-0001')
    expect(formatAuditId(1234)).toBe('au-1234')
    expect(formatAuditId(12345)).toBe('au-12345')
  })

  it('reads a sequence back out of an id', () => {
    expect(auditSequenceOf('au-0007')).toBe(7)
    expect(auditSequenceOf(formatAuditId(42))).toBe(42)
  })

  it('treats an unrecognised id as sequence zero', () => {
    expect(auditSequenceOf('whatever')).toBe(0)
    expect(auditSequenceOf('au-abc')).toBe(0)
    expect(auditSequenceOf('')).toBe(0)
  })

  it('finds the highest sequence so a reload cannot reuse one', () => {
    expect(highestAuditSequence([entry({ id: 'au-0003' }), entry({ id: 'au-0011' })])).toBe(11)
    expect(highestAuditSequence([])).toBe(0)
  })
})

describe('ordering', () => {
  it('puts the newest entry first', () => {
    const older = entry({ id: 'au-0001', at: MONDAY })
    const newer = entry({ id: 'au-0002', at: TUESDAY })

    expect(sortAuditEntries([older, newer])).toEqual([newer, older])
    expect(compareAuditEntries(newer, older)).toBeLessThan(0)
  })

  it('breaks ties on the same millisecond by id, descending', () => {
    const first = entry({ id: 'au-0001' })
    const second = entry({ id: 'au-0002' })

    expect(sortAuditEntries([first, second]).map((e) => e.id)).toEqual(['au-0002', 'au-0001'])
    expect(sortAuditEntries([second, first]).map((e) => e.id)).toEqual(['au-0002', 'au-0001'])
    expect(compareAuditEntries(first, first)).toBe(0)
  })

  it('does not mutate the array it was given', () => {
    const entries = [entry({ id: 'au-0001' }), entry({ id: 'au-0002' })]
    sortAuditEntries(entries)

    expect(entries.map((e) => e.id)).toEqual(['au-0001', 'au-0002'])
  })
})

describe('appendAuditEntry', () => {
  it('adds to the end and leaves the original alone', () => {
    const entries = [entry({ id: 'au-0001' })]
    const next = appendAuditEntry(entries, entry({ id: 'au-0002' }))

    expect(next.map((e) => e.id)).toEqual(['au-0001', 'au-0002'])
    expect(entries).toHaveLength(1)
  })

  it('trims the oldest once the cap is passed', () => {
    const entries = [1, 2, 3].map((n) => entry({ id: formatAuditId(n), at: MONDAY + n }))
    const next = appendAuditEntry(entries, entry({ id: 'au-0004', at: MONDAY + 4 }), 3)

    expect(next.map((e) => e.id)).toEqual(['au-0002', 'au-0003', 'au-0004'])
  })

  it('keeps only the newest entry when the cap is one', () => {
    const next = appendAuditEntry([entry({ id: 'au-0001' })], entry({ id: 'au-0002' }), 1)

    expect(next.map((e) => e.id)).toEqual(['au-0002'])
  })
})

describe('filterAuditEntries', () => {
  const entries = [
    entry({ id: 'au-0001', actorId: 'm-ilra', action: 'booking-created', subject: 'laser-a' }),
    entry({ id: 'au-0002', actorId: 'm-pia', action: 'booking-cancelled', subject: 'laser-a' }),
    entry({ id: 'au-0003', actorId: 'm-ilra', action: 'booking-created', subject: 'cnc-a' }),
  ]

  it('returns everything, newest first, with no filter', () => {
    expect(filterAuditEntries(entries).map((e) => e.id)).toEqual(['au-0003', 'au-0002', 'au-0001'])
  })

  it('filters by actor', () => {
    expect(filterAuditEntries(entries, { actorId: 'm-ilra' }).map((e) => e.id)).toEqual([
      'au-0003',
      'au-0001',
    ])
  })

  it('filters by action', () => {
    expect(filterAuditEntries(entries, { action: 'booking-cancelled' }).map((e) => e.id)).toEqual([
      'au-0002',
    ])
  })

  it('filters by subject', () => {
    expect(filterAuditEntries(entries, { subject: 'cnc-a' }).map((e) => e.id)).toEqual(['au-0003'])
  })

  it('combines filters', () => {
    const narrow = { actorId: 'm-ilra', action: 'booking-created' as const, subject: 'cnc-a' }

    expect(filterAuditEntries(entries, narrow)).toHaveLength(1)
    expect(filterAuditEntries(entries, { actorId: 'm-pia', subject: 'cnc-a' })).toEqual([])
  })
})

describe('calendar arithmetic', () => {
  it('counts whole days from the epoch', () => {
    expect(epochDay(0)).toBe(0)
    expect(epochDay(MONDAY)).toBe(20_682)
    expect(epochDay(-3_600_000)).toBe(-1)
  })

  it('formats a UTC day key', () => {
    expect(formatDayKey(0)).toBe('1970-01-01')
    expect(formatDayKey(MONDAY)).toBe('2026-08-17')
    expect(formatDayKey(TUESDAY)).toBe('2026-08-18')
  })

  it('handles a leap day and a year end', () => {
    expect(formatDayKey(1_709_251_140_000)).toBe('2024-02-29')
    expect(formatDayKey(946_641_600_000)).toBe('1999-12-31')
  })

  it('names the weekday, Monday first', () => {
    expect(weekdayOf(0)).toBe(3)
    expect(weekdayOf(MONDAY)).toBe(0)
    expect(weekdayOf(TUESDAY)).toBe(1)
  })

  it('writes a readable day label', () => {
    expect(formatDayLabel(MONDAY)).toBe('Monday 17 August 2026')
    expect(formatDayLabel(0)).toBe('Thursday 1 January 1970')
  })

  it('formats the time of day zero-padded', () => {
    expect(formatAuditTime(MONDAY)).toBe('18:04')
    expect(formatAuditTime(TUESDAY)).toBe('00:30')
    expect(formatAuditTime(0)).toBe('00:00')
  })
})

describe('formatAuditEntry', () => {
  it('reads as a sentence with the actor, the machine, and the detail', () => {
    expect(formatAuditEntry(entry())).toBe(
      'Ilra Diagana booked Big laser — Mon 18:00 – 19:00',
    )
  })

  it('leaves the detail off when there is none', () => {
    expect(formatAuditEntry(entry({ details: '   ' }))).toBe('Ilra Diagana booked Big laser')
  })

  it('has a phrase for every action', () => {
    expect(formatAuditEntry(entry({ action: 'booking-moved' }))).toContain(
      'moved a booking on Big laser',
    )
    expect(formatAuditEntry(entry({ action: 'booking-cancelled' }))).toContain(
      'cancelled a booking on Big laser',
    )
    expect(
      formatAuditEntry(entry({ action: 'bookings-imported', subject: 'CSV', details: '3 rows' })),
    ).toBe('Ilra Diagana imported bookings from CSV — 3 rows')
    expect(formatAuditEntry(entry({ action: 'bookings-exported', subject: 'CSV' }))).toContain(
      'exported bookings as CSV',
    )
    expect(formatAuditEntry(entry({ action: 'member-switched', subject: 'm-pia' }))).toContain(
      'signed in as Pia Lindqvist',
    )
  })

  it('falls back to raw ids the roster no longer knows', () => {
    expect(formatAuditEntry(entry({ actorId: 'm-gone', subject: 'laser-z', details: '' }))).toBe(
      'm-gone booked laser-z',
    )
  })

  it('resolves a subject that is a machine, a member, or neither', () => {
    expect(describeAuditSubject('laser-a')).toBe('Big laser')
    expect(describeAuditSubject('m-pia')).toBe('Pia Lindqvist')
    expect(describeAuditSubject('CSV')).toBe('CSV')
  })
})

describe('groupAuditEntriesByDay', () => {
  it('groups by UTC day, newest day first', () => {
    const groups = groupAuditEntriesByDay([
      entry({ id: 'au-0001', at: MONDAY }),
      entry({ id: 'au-0002', at: TUESDAY }),
      entry({ id: 'au-0003', at: MONDAY + 60_000 }),
    ])

    expect(groups.map((group) => group.key)).toEqual(['2026-08-18', '2026-08-17'])
    expect(groups[0].label).toBe('Tuesday 18 August 2026')
    expect(groups[1].entries.map((e) => e.id)).toEqual(['au-0003', 'au-0001'])
  })

  it('splits entries either side of midnight', () => {
    const midnight = TUESDAY - 30 * 60_000

    const groups = groupAuditEntriesByDay([
      entry({ id: 'au-0001', at: midnight }),
      entry({ id: 'au-0002', at: midnight - 1 }),
    ])

    expect(groups.map((group) => group.key)).toEqual(['2026-08-18', '2026-08-17'])
    expect(groups.map((group) => group.entries.length)).toEqual([1, 1])
  })

  it('groups nothing into nothing', () => {
    expect(groupAuditEntriesByDay([])).toEqual([])
  })
})
