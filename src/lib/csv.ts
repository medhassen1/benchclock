import { DAY_NAMES, MACHINES, MEMBERS, SLOT_MINUTES } from '@/data/workshop'
import { dayOf, formatClock, minuteOfDay, weekMinute } from '@/lib/weektime'
import type { Booking, BookingDraft, Machine, Member } from '@/types'

/**
 * A dependency-free RFC 4180 reader and writer, plus the booking-specific
 * layer the data page uses. Nothing here throws: a malformed file has to come
 * back as data the UI can show, not as an exception that loses the paste.
 */

export interface CsvRecord {
  fields: string[]
  /**
   * 1-based physical line the record starts on. Tracked separately from the
   * record index because a quoted field may itself contain newlines, so the
   * two stop agreeing the moment a file uses one.
   */
  line: number
}

/** Fields needing quotes: a separator, a quote, or either newline character. */
const NEEDS_QUOTES = /["\r\n,]/

/**
 * Splits CSV text into records, honouring quoted fields, `""` escapes,
 * newlines inside quotes, and both CRLF and LF line endings.
 *
 * Trailing blank records are dropped: files routinely end with one or more
 * newlines and an empty final record is never meaningful data. Blank lines in
 * the middle are kept, as a record holding a single empty field, so callers
 * that care about row numbering still line up with the file.
 */
export function parseCsvRecords(text: string): CsvRecord[] {
  // A BOM written by a spreadsheet export would otherwise become part of the
  // first header name and break every column lookup.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  // Only a quote at the very start of a field opens a quoted field; anywhere
  // else it is an ordinary character, which is what `a"b` must stay.
  let atFieldStart = true
  let line = 1
  let recordLine = 1
  let index = 0

  const endField = () => {
    fields.push(field)
    field = ''
    atFieldStart = true
  }

  const endRecord = () => {
    endField()
    records.push({ fields, line: recordLine })
    fields = []
  }

  while (index < source.length) {
    const char = source[index]

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }

      if (char === '\n') line += 1
      field += char
      index += 1
      continue
    }

    if (char === '"' && atFieldStart) {
      quoted = true
      atFieldStart = false
      index += 1
      continue
    }

    if (char === ',') {
      endField()
      index += 1
      continue
    }

    if (char === '\r' || char === '\n') {
      endRecord()
      index += char === '\r' && source[index + 1] === '\n' ? 2 : 1
      line += 1
      recordLine = line
      continue
    }

    field += char
    atFieldStart = false
    index += 1
  }

  // An unterminated quote still yields whatever was read, so the member sees
  // their data and a row error rather than an empty preview.
  endRecord()

  while (records.length > 0) {
    const last = records[records.length - 1]
    if (last.fields.length === 1 && last.fields[0] === '') records.pop()
    else break
  }

  return records
}

/** The same parse as `parseCsvRecords`, without the line numbers. */
export function parseCsv(text: string): string[][] {
  return parseCsvRecords(text).map((record) => record.fields)
}

/** Quotes a single field only when it would otherwise be ambiguous. */
export function escapeCsvField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export interface CsvWriteOptions {
  /** RFC 4180 says CRLF; `\n` is friendlier inside a textarea. */
  eol?: string
}

/** Serialises rows, always ending the file with a line break. */
export function toCsv(
  rows: readonly (readonly string[])[],
  { eol = '\r\n' }: CsvWriteOptions = {},
): string {
  if (rows.length === 0) return ''
  return rows.map((row) => row.map(escapeCsvField).join(',')).join(eol) + eol
}

/**
 * Both the machine and the member appear twice: the id column is what a
 * re-import matches on, and the name column is what makes the file readable
 * for someone editing it in a spreadsheet.
 */
export const BOOKING_CSV_HEADER = [
  'machineId',
  'machine',
  'memberId',
  'member',
  'day',
  'start',
  'end',
  'note',
] as const

export interface BookingCsvError {
  /** 1-based physical line of the offending record. */
  line: number
  /** Header name the problem belongs to, when it belongs to one. */
  column?: string
  message: string
}

export interface BookingCsvParse {
  rows: BookingDraft[]
  errors: BookingCsvError[]
}

/** Column names are matched loosely so `Machine ID` and `machine_id` agree. */
function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, '')
}

function cell(record: CsvRecord, index: number | undefined): string {
  // Ragged rows are normal in hand-edited files; a missing cell reads as empty
  // and is reported by the field-level checks below.
  if (index === undefined) return ''
  return (record.fields[index] ?? '').trim()
}

function matchesText(value: string, candidate: string): boolean {
  return value.toLowerCase() === candidate.trim().toLowerCase()
}

function findMachine(id: string, label: string): Machine | undefined {
  const wanted = id || label
  if (!wanted) return undefined

  return MACHINES.find(
    (machine) =>
      matchesText(wanted, machine.id) ||
      matchesText(wanted, machine.code) ||
      matchesText(wanted, machine.name),
  )
}

function findMember(id: string, label: string): Member | undefined {
  const wanted = id || label
  if (!wanted) return undefined

  return MEMBERS.find(
    (member) => matchesText(wanted, member.id) || matchesText(wanted, member.name),
  )
}

/** `Monday` or `Mon`, case-insensitively; -1 when it is neither. */
export function parseDayName(value: string): number {
  const wanted = value.trim().toLowerCase()
  if (wanted === '') return -1

  return DAY_NAMES.findIndex(
    (name) => name.toLowerCase() === wanted || name.slice(0, 3).toLowerCase() === wanted,
  )
}

/**
 * `HH:MM` to minutes past midnight, or -1. `24:00` is accepted so a booking
 * that runs to the end of a day survives a round trip.
 */
export function parseClock(value: string): number {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim())
  if (!match) return -1

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || (hours === 24 && minutes !== 0)) return -1

  return hours * 60 + minutes
}

/** `24:00` rather than `00:00`, so an end-of-day finish keeps its day. */
function formatEndClock(booking: Pick<Booking, 'startMinute' | 'endMinute'>): string {
  const endsAtMidnight = minuteOfDay(booking.endMinute) === 0
  return endsAtMidnight && booking.endMinute > booking.startMinute
    ? '24:00'
    : formatClock(booking.endMinute)
}

/** Bookings as CSV rows, oldest slot first and ties broken by id. */
export function bookingsToCsvRows(bookings: readonly Booking[]): string[][] {
  const ordered = [...bookings].sort(
    (a, b) => a.startMinute - b.startMinute || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  const rows: string[][] = [[...BOOKING_CSV_HEADER]]

  for (const booking of ordered) {
    const machine = MACHINES.find((entry) => entry.id === booking.machineId)
    const member = MEMBERS.find((entry) => entry.id === booking.memberId)

    rows.push([
      booking.machineId,
      machine?.name ?? '',
      booking.memberId,
      member?.name ?? '',
      DAY_NAMES[dayOf(booking.startMinute)] ?? '',
      formatClock(booking.startMinute),
      formatEndClock(booking),
      booking.note,
    ])
  }

  return rows
}

export function bookingsToCsv(
  bookings: readonly Booking[],
  options: CsvWriteOptions = {},
): string {
  return toCsv(bookingsToCsvRows(bookings), options)
}

/**
 * Reads pasted CSV back into drafts. Every row is judged on its own: a bad row
 * contributes an error and is left out, and the rows around it still import.
 *
 * Only shape is checked here — unknown machine, unparseable time, end before
 * start. Whether the workshop will actually accept the slot is the booking
 * rules' business, and is decided when the draft is applied.
 */
export function parseBookingsCsv(text: string): BookingCsvParse {
  const records = parseCsvRecords(text)
  const rows: BookingDraft[] = []
  const errors: BookingCsvError[] = []

  const header = records.find((record) => record.fields.some((value) => value.trim() !== ''))
  if (!header) return { rows, errors }

  const columns = new Map<string, number>()
  header.fields.forEach((name, index) => {
    const key = normaliseHeader(name)
    // First column wins, so a duplicated header cannot silently shadow it.
    if (key !== '' && !columns.has(key)) columns.set(key, index)
  })

  const machineIdAt = columns.get('machineid')
  const machineAt = columns.get('machine')
  const memberIdAt = columns.get('memberid')
  const memberAt = columns.get('member')
  const dayAt = columns.get('day')
  const startAt = columns.get('start')
  const endAt = columns.get('end')
  const noteAt = columns.get('note')

  const missing: string[] = []
  if (machineIdAt === undefined && machineAt === undefined) missing.push('machineId')
  if (memberIdAt === undefined && memberAt === undefined) missing.push('memberId')
  if (dayAt === undefined) missing.push('day')
  if (startAt === undefined) missing.push('start')
  if (endAt === undefined) missing.push('end')

  if (missing.length > 0) {
    errors.push({
      line: header.line,
      message: `The header row is missing: ${missing.join(', ')}.`,
    })
    return { rows, errors }
  }

  for (const record of records) {
    if (record === header) continue
    // A blank line between blocks of rows is punctuation, not a broken row.
    if (record.fields.every((value) => value.trim() === '')) continue

    const rowErrors: BookingCsvError[] = []
    const fail = (column: string, message: string) =>
      rowErrors.push({ line: record.line, column, message })

    const machineCell = cell(record, machineIdAt) || cell(record, machineAt)
    const machine = findMachine(cell(record, machineIdAt), cell(record, machineAt))
    if (!machine) {
      const message =
        machineCell === '' ? 'Machine is required.' : `Unknown machine “${machineCell}”.`
      fail('machine', message)
    }

    const memberCell = cell(record, memberIdAt) || cell(record, memberAt)
    const member = findMember(cell(record, memberIdAt), cell(record, memberAt))
    if (!member) {
      const message = memberCell === '' ? 'Member is required.' : `Unknown member “${memberCell}”.`
      fail('member', message)
    }

    const dayCell = cell(record, dayAt)
    const day = parseDayName(dayCell)
    if (day < 0) {
      fail('day', dayCell === '' ? 'Day is required.' : `Unknown day “${dayCell}”.`)
    }

    const startCell = cell(record, startAt)
    const start = parseClock(startCell)
    if (start < 0) {
      const message =
        startCell === '' ? 'Start time is required.' : `“${startCell}” is not a HH:MM time.`
      fail('start', message)
    }

    const endCell = cell(record, endAt)
    const end = parseClock(endCell)
    if (end < 0) {
      fail('end', endCell === '' ? 'End time is required.' : `“${endCell}” is not a HH:MM time.`)
    }

    if (start >= 0 && end >= 0) {
      if (end <= start) fail('end', 'The end time must be after the start time.')
      else if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
        fail('start', 'Times must fall on the half hour.')
      }
    }

    if (rowErrors.length > 0 || !machine || !member) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      machineId: machine.id,
      memberId: member.id,
      startMinute: weekMinute(day, start),
      endMinute: weekMinute(day, end),
      note: cell(record, noteAt),
    })
  }

  return { rows, errors }
}
