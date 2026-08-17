import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '@/lib/api'
import { weekMinute } from '@/lib/weektime'
import { BoardProvider } from '@/state/BoardProvider'
import { useBoard } from '@/state/board-context'
import type { BookingDraft } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const draft = (over: Partial<BookingDraft> = {}): BookingDraft => ({
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 19),
  endMinute: at(0, 20),
  note: '',
  ...over,
})

const wrapper = ({ children }: { children: ReactNode }) => <BoardProvider>{children}</BoardProvider>
const renderBoard = () => renderHook(() => useBoard(), { wrapper })

beforeEach(() => {
  api.configureLatency(0)
  api.resetIdCounter()
})

afterEach(() => {
  api.configureLatency()
})

describe('BoardProvider', () => {
  it('starts empty', () => {
    const { result } = renderBoard()

    expect(result.current.bookings).toEqual([])
  })

  it('adds a booking that the rules accept', async () => {
    const { result } = renderBoard()

    let outcome: Awaited<ReturnType<typeof result.current.createBooking>> | undefined
    await act(async () => {
      outcome = await result.current.createBooking(draft())
    })

    expect(outcome?.ok).toBe(true)
    expect(result.current.bookings).toHaveLength(1)
    expect(result.current.bookings[0].id).toBe('bk-0001')
  })

  it('shows the booking immediately, before the write resolves', async () => {
    api.configureLatency(40)
    const { result } = renderBoard()

    let pending: Promise<unknown> | undefined
    act(() => {
      pending = result.current.createBooking(draft())
    })

    // Optimistic row is on the board with a temporary id, marked pending.
    expect(result.current.bookings).toHaveLength(1)
    expect(result.current.pendingIds.size).toBe(1)
    expect(result.current.bookings[0].id).toMatch(/^pending-/)

    await act(async () => {
      await pending
    })

    expect(result.current.bookings[0].id).toBe('bk-0001')
    expect(result.current.pendingIds.size).toBe(0)
  })

  it('rolls the optimistic row back when the rules refuse it', async () => {
    const { result } = renderBoard()

    let outcome: Awaited<ReturnType<typeof result.current.createBooking>> | undefined
    await act(async () => {
      outcome = await result.current.createBooking(draft({ memberId: 'm-pia' }))
    })

    expect(outcome?.ok).toBe(false)
    expect(outcome?.rejections?.map((r) => r.code)).toContain('missing-ticket')
    expect(result.current.bookings).toEqual([])
    expect(result.current.pendingIds.size).toBe(0)
  })

  it('validates a second booking against the first', async () => {
    const { result } = renderBoard()

    await act(async () => {
      await result.current.createBooking(draft())
    })

    let outcome: Awaited<ReturnType<typeof result.current.createBooking>> | undefined
    await act(async () => {
      outcome = await result.current.createBooking(draft())
    })

    expect(outcome?.ok).toBe(false)
    expect(outcome?.rejections?.map((r) => r.code)).toContain('overlaps-booking')
    expect(result.current.bookings).toHaveLength(1)
  })

  it('reports a transport failure without leaving a phantom row', async () => {
    const { result } = renderBoard()
    vi.spyOn(api, 'createBooking').mockRejectedValueOnce(new Error('network down'))

    let outcome: Awaited<ReturnType<typeof result.current.createBooking>> | undefined
    await act(async () => {
      outcome = await result.current.createBooking(draft())
    })

    expect(outcome?.ok).toBe(false)
    expect(result.current.bookings).toEqual([])
  })

  it('moves a booking, keeping its id', async () => {
    const { result } = renderBoard()

    await act(async () => {
      await result.current.createBooking(draft())
    })
    await act(async () => {
      await result.current.updateBooking(
        'bk-0001',
        draft({ startMinute: at(0, 20), endMinute: at(0, 21) }),
      )
    })

    expect(result.current.bookings).toHaveLength(1)
    expect(result.current.bookings[0]).toMatchObject({
      id: 'bk-0001',
      startMinute: at(0, 20),
    })
  })

  it('restores the original times when a move is refused', async () => {
    const { result } = renderBoard()

    await act(async () => {
      await result.current.createBooking(draft())
    })
    await act(async () => {
      await result.current.createBooking(
        draft({ startMinute: at(0, 20, 30), endMinute: at(0, 21, 30) }),
      )
    })

    let outcome: Awaited<ReturnType<typeof result.current.updateBooking>> | undefined
    await act(async () => {
      outcome = await result.current.updateBooking(
        'bk-0001',
        draft({ startMinute: at(0, 20, 30), endMinute: at(0, 21, 30) }),
      )
    })

    expect(outcome?.ok).toBe(false)
    expect(result.current.bookings.find((b) => b.id === 'bk-0001')).toMatchObject({
      startMinute: at(0, 19),
      endMinute: at(0, 20),
    })
  })

  it('ignores a move for an id that is not on the board', async () => {
    const { result } = renderBoard()

    let outcome: Awaited<ReturnType<typeof result.current.updateBooking>> | undefined
    await act(async () => {
      outcome = await result.current.updateBooking('bk-9999', draft())
    })

    expect(outcome?.ok).toBe(false)
  })

  it('cancels a booking', async () => {
    const { result } = renderBoard()

    await act(async () => {
      await result.current.createBooking(draft())
    })
    await act(async () => {
      await result.current.cancelBooking('bk-0001')
    })

    expect(result.current.bookings).toEqual([])
  })

  it('restores a booking when the cancel fails', async () => {
    const { result } = renderBoard()

    await act(async () => {
      await result.current.createBooking(draft())
    })

    vi.spyOn(api, 'cancelBooking').mockRejectedValueOnce(new Error('network down'))

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.cancelBooking('bk-0001')
    })

    expect(ok).toBe(false)
    expect(result.current.bookings).toHaveLength(1)
    expect(result.current.bookings[0].id).toBe('bk-0001')
  })

  it('ignores a cancel for an id that is not on the board', async () => {
    const { result } = renderBoard()

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.cancelBooking('bk-9999')
    })

    expect(ok).toBe(false)
  })

  it('groups bookings by machine and by member', async () => {
    const { result } = renderBoard()

    await act(async () => {
      await result.current.createBooking(draft())
    })
    await act(async () => {
      await result.current.createBooking(
        draft({ machineId: 'printer-b', memberId: 'm-pia', startMinute: at(1, 18), endMinute: at(1, 19) }),
      )
    })

    expect(result.current.bookingsForMachine('laser-a')).toHaveLength(1)
    expect(result.current.bookingsForMachine('printer-b')).toHaveLength(1)
    expect(result.current.bookingsForMachine('cnc-a')).toEqual([])
    expect(result.current.bookingsForMember('m-pia')).toHaveLength(1)
  })

  it('persists the board across a remount', async () => {
    const first = renderBoard()
    await act(async () => {
      await first.result.current.createBooking(draft())
    })
    first.unmount()

    const second = renderBoard()

    await waitFor(() => expect(second.result.current.bookings).toHaveLength(1))
  })

  it('discards a persisted board that does not match the schema', () => {
    window.localStorage.setItem('benchclock:bookings:v1', JSON.stringify([{ id: 'x' }]))

    const { result } = renderBoard()

    expect(result.current.bookings).toEqual([])
  })

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useBoard())).toThrow(
      /useBoard must be used inside a <BoardProvider>/,
    )
  })
})
