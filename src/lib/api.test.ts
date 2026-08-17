import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  BookingRejectedError,
  NotFoundError,
  RequestAbortedError,
  cancelBooking,
  configureLatency,
  createBooking,
  isAbortError,
  updateBooking,
  resetIdCounter,
} from '@/lib/api'
import { weekMinute } from '@/lib/weektime'
import type { Booking, BookingDraft } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const draft = (over: Partial<BookingDraft> = {}): BookingDraft => ({
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 19),
  endMinute: at(0, 20),
  note: '',
  ...over,
})

const stored = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-0001',
  machineId: 'laser-a',
  memberId: 'm-tomas',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  createdAt: 1,
  ...over,
})

beforeEach(() => {
  configureLatency(0)
  resetIdCounter()
})

afterEach(() => {
  configureLatency()
})

describe('createBooking', () => {
  it('stores a valid draft and assigns an id', async () => {
    const booking = await createBooking(draft(), [])

    expect(booking).toMatchObject({ id: 'bk-0001', machineId: 'laser-a' })
  })

  it('assigns increasing ids', async () => {
    const first = await createBooking(draft(), [])
    const second = await createBooking(draft({ startMinute: at(1, 19), endMinute: at(1, 20) }), [])

    expect([first.id, second.id]).toEqual(['bk-0001', 'bk-0002'])
  })

  it('refuses a draft that breaks a rule, carrying the reasons', async () => {
    const error = await createBooking(draft({ memberId: 'm-pia' }), []).catch((e) => e)

    expect(error).toBeInstanceOf(BookingRejectedError)
    expect((error as BookingRejectedError).rejections.map((r) => r.code)).toContain(
      'missing-ticket',
    )
  })

  it('validates against the board it is given, not a stale copy', async () => {
    const error = await createBooking(draft(), [stored({ endMinute: at(0, 20) })]).catch((e) => e)

    expect(error).toBeInstanceOf(BookingRejectedError)
    expect((error as BookingRejectedError).rejections.map((r) => r.code)).toContain(
      'overlaps-booking',
    )
  })

  it('rejects an unknown machine or member', async () => {
    await expect(createBooking(draft({ machineId: 'nope' }), [])).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(createBooking(draft({ memberId: 'nope' }), [])).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('aborts mid-flight', async () => {
    configureLatency(50)
    const controller = new AbortController()
    const pending = createBooking(draft(), [], { signal: controller.signal })

    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError)
  })

  it('rejects immediately when the signal is already aborted', async () => {
    configureLatency(1_000)
    const controller = new AbortController()
    controller.abort()

    await expect(
      createBooking(draft(), [], { signal: controller.signal }),
    ).rejects.toBeInstanceOf(RequestAbortedError)
  })

  it('can resolve out of order', async () => {
    const settled: string[] = []
    configureLatency((label) => (label.includes('laser-a') ? 40 : 5))

    await Promise.all([
      createBooking(draft(), []).then(() => settled.push('slow')),
      createBooking(draft({ machineId: 'printer-b' }), []).then(() => settled.push('fast')),
    ])

    expect(settled).toEqual(['fast', 'slow'])
  })
})

describe('updateBooking', () => {
  it('re-times a booking without clashing with its own old slot', async () => {
    const board = [stored({ id: 'bk-1', memberId: 'm-ilra' })]

    const moved = await updateBooking(
      'bk-1',
      draft({ startMinute: at(0, 18, 30), endMinute: at(0, 19, 30) }),
      board,
    )

    expect(moved).toMatchObject({ id: 'bk-1', startMinute: at(0, 18, 30) })
  })

  it('keeps the original id and creation order', async () => {
    const board = [stored({ id: 'bk-1', memberId: 'm-ilra', createdAt: 7 })]

    const moved = await updateBooking('bk-1', draft(), board)

    expect(moved.id).toBe('bk-1')
    expect(moved.createdAt).toBe(7)
  })

  it('still refuses a move that clashes with a different booking', async () => {
    const board = [
      stored({ id: 'bk-1', memberId: 'm-ilra' }),
      stored({ id: 'bk-2', startMinute: at(0, 20), endMinute: at(0, 21) }),
    ]

    const error = await updateBooking(
      'bk-1',
      draft({ startMinute: at(0, 20), endMinute: at(0, 21) }),
      board,
    ).catch((e) => e)

    expect(error).toBeInstanceOf(BookingRejectedError)
    expect((error as BookingRejectedError).rejections.map((r) => r.code)).toContain(
      'overlaps-booking',
    )
  })

  it('rejects an unknown booking id', async () => {
    await expect(updateBooking('bk-9999', draft(), [])).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('cancelBooking', () => {
  it('returns the id it removed', async () => {
    await expect(cancelBooking('bk-0001', [stored()])).resolves.toBe('bk-0001')
  })

  it('rejects an id that is not on the board', async () => {
    await expect(cancelBooking('bk-9999', [stored()])).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('isAbortError', () => {
  it('recognises both abort shapes', () => {
    const domStyle = new Error('aborted')
    domStyle.name = 'AbortError'

    expect(isAbortError(new RequestAbortedError())).toBe(true)
    expect(isAbortError(domStyle)).toBe(true)
    expect(isAbortError(new Error('boom'))).toBe(false)
  })
})
