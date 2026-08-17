import { describe, expect, it } from 'vitest'

import {
  BOOKING_CSV_HEADER,
  bookingsToCsv,
  bookingsToCsvRows,
  escapeCsvField,
  parseBookingsCsv,
  parseClock,
  parseCsv,
  parseCsvRecords,
  parseDayName,
  toCsv,
} from '@/lib/csv'
import { weekMinute } from '@/lib/weektime'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-0001',
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 19, 30),
  note: '',
  createdAt: 1,
  ...over,
})

const header = BOOKING_CSV_HEADER.join(',')

describe('parseCsv', () => {
  it('reads a plain grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('reads CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads a lone CR as a line ending', () => {
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('ignores a trailing newline', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']])
  })

  it('ignores blank trailing lines, however many', () => {
    expect(parseCsv('a,b\n\n\n\n')).toEqual([['a', 'b']])
  })

  it('keeps a blank line in the middle as an empty record', () => {
    expect(parseCsv('a\n\nb')).toEqual([['a'], [''], ['b']])
  })

  it('returns nothing for empty or whitespace-only input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n')).toEqual([])
    expect(parseCsv('\r\n')).toEqual([])
  })

  it('keeps empty fields, including leading and trailing ones', () => {
    expect(parseCsv(',a,')).toEqual([['', 'a', '']])
    expect(parseCsv(',,')).toEqual([['', '', '']])
  })

  it('unwraps quoted fields', () => {
    expect(parseCsv('"a","b"')).toEqual([['a', 'b']])
    expect(parseCsv('"",x')).toEqual([['', 'x']])
  })

  it('keeps commas inside quotes', () => {
    expect(parseCsv('"Berg, Tomas",laser')).toEqual([['Berg, Tomas', 'laser']])
  })

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', 'b']])
    expect(parseCsv('"""",b')).toEqual([['"', 'b']])
  })

  it('keeps newlines inside a quoted field', () => {
    expect(parseCsv('"line one\nline two",b')).toEqual([['line one\nline two', 'b']])
    expect(parseCsv('"a\r\nb",c\nd,e')).toEqual([
      ['a\r\nb', 'c'],
      ['d', 'e'],
    ])
  })

  it('treats a quote that is not at the field start as an ordinary character', () => {
    expect(parseCsv('a"b,c')).toEqual([['a"b', 'c']])
    expect(parseCsv('12" pipe,c')).toEqual([['12" pipe', 'c']])
  })

  it('strips a leading byte order mark', () => {
    expect(parseCsv('﻿machine,day')).toEqual([['machine', 'day']])
    expect(parseCsv('﻿"machine",day')).toEqual([['machine', 'day']])
  })

  it('keeps ragged rows exactly as written', () => {
    expect(parseCsv('a,b,c\n1\n2,3')).toEqual([['a', 'b', 'c'], ['1'], ['2', '3']])
  })

  it('recovers whatever it read from an unterminated quote', () => {
    expect(parseCsv('a,"open ended')).toEqual([['a', 'open ended']])
  })

  it('numbers records by physical line, counting newlines inside quotes', () => {
    const records = parseCsvRecords('h1,h2\n"a\nb",c\nd,e\n')

    expect(records.map((record) => record.line)).toEqual([1, 2, 4])
    expect(records[1].fields).toEqual(['a\nb', 'c'])
  })
})

describe('toCsv', () => {
  it('writes rows with a trailing line break', () => {
    expect(toCsv([['a', 'b']], { eol: '\n' })).toBe('a,b\n')
  })

  it('defaults to CRLF', () => {
    expect(toCsv([['a'], ['b']])).toBe('a\r\nb\r\n')
  })

  it('writes nothing for no rows', () => {
    expect(toCsv([])).toBe('')
  })

  it('quotes only fields that need it', () => {
    expect(escapeCsvField('plain')).toBe('plain')
    expect(escapeCsvField('a,b')).toBe('"a,b"')
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvField('two\nlines')).toBe('"two\nlines"')
    expect(escapeCsvField('')).toBe('')
  })

  it('round-trips awkward fields', () => {
    const rows = [
      ['a,b', 'say "hi"', 'two\nlines', '', 'plain'],
      ['', '"', '\r\n', 'x', 'y'],
    ]

    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('parseDayName', () => {
  it('accepts full and short day names in any case', () => {
    expect(parseDayName('Monday')).toBe(0)
    expect(parseDayName('mon')).toBe(0)
    expect(parseDayName(' SUNDAY ')).toBe(6)
  })

  it('rejects anything else', () => {
    expect(parseDayName('Moonday')).toBe(-1)
    expect(parseDayName('')).toBe(-1)
    expect(parseDayName('0')).toBe(-1)
  })
})

describe('parseClock', () => {
  it('reads HH:MM', () => {
    expect(parseClock('18:00')).toBe(18 * 60)
    expect(parseClock('9:30')).toBe(9 * 60 + 30)
    expect(parseClock('00:00')).toBe(0)
  })

  it('accepts 24:00 as the end of a day', () => {
    expect(parseClock('24:00')).toBe(24 * 60)
    expect(parseClock('24:30')).toBe(-1)
  })

  it('rejects malformed times', () => {
    expect(parseClock('25:00')).toBe(-1)
    expect(parseClock('18:60')).toBe(-1)
    expect(parseClock('1800')).toBe(-1)
    expect(parseClock('six')).toBe(-1)
    expect(parseClock('')).toBe(-1)
  })
})

describe('bookingsToCsv', () => {
  it('writes a header and one row per booking', () => {
    const rows = bookingsToCsvRows([booking()])

    expect(rows[0]).toEqual([...BOOKING_CSV_HEADER])
    expect(rows[1]).toEqual([
      'laser-a',
      'Big laser',
      'm-ilra',
      'Ilra Diagana',
      'Monday',
      '18:00',
      '19:30',
      '',
    ])
  })

  it('orders by start time, then by id', () => {
    const rows = bookingsToCsvRows([
      booking({ id: 'bk-3', startMinute: at(2, 18), endMinute: at(2, 19) }),
      booking({ id: 'bk-2', startMinute: at(0, 18), endMinute: at(0, 19) }),
      booking({ id: 'bk-1', startMinute: at(0, 18), endMinute: at(0, 19) }),
    ])

    expect(rows.slice(1).map((row) => row[4])).toEqual(['Monday', 'Monday', 'Wednesday'])
    expect(rows[1][5]).toBe('18:00')
  })

  it('writes a midnight finish as 24:00 so it keeps its day', () => {
    const rows = bookingsToCsvRows([booking({ startMinute: at(0, 22), endMinute: at(1, 0) })])

    expect(rows[1][4]).toBe('Monday')
    expect(rows[1][6]).toBe('24:00')
  })

  it('quotes a note containing a comma, a quote, or a newline', () => {
    const csv = bookingsToCsv([booking({ note: 'lamp, base "v2"' })], { eol: '\n' })

    expect(csv).toContain('"lamp, base ""v2"""')
    expect(csv.endsWith('\n')).toBe(true)
  })

  it('survives a round trip through the parser', () => {
    const original = booking({ note: 'panel, "final"\nrun two' })
    const { rows, errors } = parseBookingsCsv(bookingsToCsv([original]))

    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        machineId: original.machineId,
        memberId: original.memberId,
        startMinute: original.startMinute,
        endMinute: original.endMinute,
        note: original.note,
      },
    ])
  })

  it('round-trips a booking that runs to midnight', () => {
    const original = booking({ startMinute: at(0, 22), endMinute: at(1, 0) })
    const { rows } = parseBookingsCsv(bookingsToCsv([original]))

    expect(rows[0].startMinute).toBe(original.startMinute)
    expect(rows[0].endMinute).toBe(original.endMinute)
  })
})

describe('parseBookingsCsv', () => {
  it('returns nothing at all for empty input', () => {
    expect(parseBookingsCsv('')).toEqual({ rows: [], errors: [] })
    expect(parseBookingsCsv('\n\n')).toEqual({ rows: [], errors: [] })
  })

  it('reads a well-formed row', () => {
    const { rows, errors } = parseBookingsCsv(
      `${header}\nlaser-a,Big laser,m-ilra,Ilra Diagana,Monday,18:00,19:00,Lamp base\n`,
    )

    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        machineId: 'laser-a',
        memberId: 'm-ilra',
        startMinute: at(0, 18),
        endMinute: at(0, 19),
        note: 'Lamp base',
      },
    ])
  })

  it('accepts columns in any order and ignores unknown ones', () => {
    const { rows, errors } = parseBookingsCsv(
      'note,end,Start,Day,Member ID,machine_id,colour\nLamp,19:00,18:00,Mon,m-ilra,laser-a,red\n',
    )

    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        machineId: 'laser-a',
        memberId: 'm-ilra',
        startMinute: at(0, 18),
        endMinute: at(0, 19),
        note: 'Lamp',
      },
    ])
  })

  it('matches a machine by id, code, or name, and a member by id or name', () => {
    const { rows, errors } = parseBookingsCsv(
      'machine,member,day,start,end\n' +
        'LZ1,Ilra Diagana,Mon,18:00,19:00\n' +
        'Big laser,m-ilra,Tue,18:00,19:00\n',
    )

    expect(errors).toEqual([])
    expect(rows.map((row) => row.machineId)).toEqual(['laser-a', 'laser-a'])
    expect(rows.map((row) => row.memberId)).toEqual(['m-ilra', 'm-ilra'])
  })

  it('reports a header row that cannot be used at all', () => {
    const { rows, errors } = parseBookingsCsv('what,when\nlaser-a,Monday\n')

    expect(rows).toEqual([])
    expect(errors).toEqual([
      { line: 1, message: 'The header row is missing: machineId, memberId, day, start, end.' },
    ])
  })

  it('keeps good rows when a neighbour is broken', () => {
    const { rows, errors } = parseBookingsCsv(
      `${header}\n` +
        'laser-a,Big laser,m-ilra,Ilra Diagana,Monday,18:00,19:00,ok\n' +
        'nope-a,Ghost,m-ilra,Ilra Diagana,Monday,20:00,21:00,bad\n' +
        'laser-b,Desktop laser,m-ilra,Ilra Diagana,Tuesday,18:00,19:00,ok too\n',
    )

    expect(rows.map((row) => row.note)).toEqual(['ok', 'ok too'])
    expect(errors).toEqual([
      { line: 3, column: 'machine', message: 'Unknown machine “nope-a”.' },
    ])
  })

  it('collects every problem in a row', () => {
    const { rows, errors } = parseBookingsCsv(
      'machineId,memberId,day,start,end\nnope,ghost,Funday,nine,ten\n',
    )

    expect(rows).toEqual([])
    expect(errors.map((error) => error.column)).toEqual([
      'machine',
      'member',
      'day',
      'start',
      'end',
    ])
    expect(errors.every((error) => error.line === 2)).toBe(true)
  })

  it('reports missing cells in a ragged row', () => {
    const { rows, errors } = parseBookingsCsv('machineId,memberId,day,start,end\nlaser-a,m-ilra\n')

    expect(rows).toEqual([])
    expect(errors.map((error) => error.message)).toEqual([
      'Day is required.',
      'Start time is required.',
      'End time is required.',
    ])
  })

  it('rejects an end that is not after the start', () => {
    const { errors } = parseBookingsCsv(
      'machineId,memberId,day,start,end\nlaser-a,m-ilra,Mon,19:00,18:00\n',
    )

    expect(errors).toEqual([
      { line: 2, column: 'end', message: 'The end time must be after the start time.' },
    ])
  })

  it('rejects times that miss the half-hour grid', () => {
    const { errors } = parseBookingsCsv(
      'machineId,memberId,day,start,end\nlaser-a,m-ilra,Mon,18:07,19:00\n',
    )

    expect(errors).toEqual([
      { line: 2, column: 'start', message: 'Times must fall on the half hour.' },
    ])
  })

  it('skips blank lines between rows without complaining', () => {
    const { rows, errors } = parseBookingsCsv(
      'machineId,memberId,day,start,end\n\nlaser-a,m-ilra,Mon,18:00,19:00\n\n',
    )

    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('points errors at the physical line, even after a quoted newline', () => {
    const { errors } = parseBookingsCsv(
      'machineId,memberId,day,start,end,note\n' +
        'laser-a,m-ilra,Mon,18:00,19:00,"two\nline note"\n' +
        'laser-a,m-ilra,Funday,18:00,19:00,\n',
    )

    expect(errors).toEqual([{ line: 4, column: 'day', message: 'Unknown day “Funday”.' }])
  })

  it('tolerates a byte order mark on the header', () => {
    const { rows, errors } = parseBookingsCsv(
      '﻿machineId,memberId,day,start,end\nlaser-a,m-ilra,Mon,18:00,19:00\n',
    )

    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('trims surrounding whitespace from every cell', () => {
    const { rows, errors } = parseBookingsCsv(
      'machineId,memberId,day,start,end,note\n  laser-a , m-ilra , Mon , 18:00 , 19:00 , Lamp \n',
    )

    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ machineId: 'laser-a', note: 'Lamp' })
  })

  it('leaves rule checking to the board: a closed-hours slot still parses', () => {
    const { rows, errors } = parseBookingsCsv(
      'machineId,memberId,day,start,end\nlaser-a,m-ilra,Mon,03:00,04:00\n',
    )

    expect(errors).toEqual([])
    expect(rows[0].startMinute).toBe(at(0, 3))
  })
})
