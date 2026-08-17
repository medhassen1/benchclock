import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '@/lib/api'
import { weekMinute } from '@/lib/weektime'
import type { WaitlistEntry, WaitlistSlot } from '@/lib/waitlist'
import { BoardProvider } from '@/state/BoardProvider'
import { useBoard } from '@/state/board-context'
import { WaitlistProvider } from '@/state/WaitlistProvider'
import { useWaitlist } from '@/state/waitlist-context'

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

const wrapper = ({ children }: { children: ReactNode }) => (
  <BoardProvider>
    <WaitlistProvider>{children}</WaitlistProvider>
  </BoardProvider>
)

const renderWaitlist = () =>
  renderHook(() => ({ waitlist: useWaitlist(), board: useBoard() }), { wrapper })

function seed(entries: Partial<WaitlistEntry>[]) {
  window.localStorage.setItem(
    'benchclock:waitlist:v1',
    JSON.stringify(
      entries.map((over, index) => ({
        id: `wl-${index + 1}`,
        machineId: SLOT.machineId,
        memberId: 'm-ilra',
        startMinute: SLOT.startMinute,
        endMinute: SLOT.endMinute,
        note: '',
        joinedAt: index + 1,
        ...over,
      })),
    ),
  )
}

beforeEach(() => {
  api.configureLatency(0)
  api.resetIdCounter()
})

afterEach(() => {
  api.configureLatency()
})

describe('WaitlistProvider', () => {
  it('starts with nobody waiting', () => {
    const { result } = renderWaitlist()

    expect(result.current.waitlist.entries).toEqual([])
    expect(result.current.waitlist.entriesForSlot(SLOT)).toEqual([])
  })

  it('adds a member to a queue', () => {
    const { result } = renderWaitlist()

    let joined: string | undefined
    act(() => {
      const outcome = result.current.waitlist.join({ ...SLOT, memberId: 'm-ilra' })
      joined = outcome.ok ? outcome.entry.id : undefined
    })

    expect(result.current.waitlist.entries).toHaveLength(1)
    expect(result.current.waitlist.positionOf(joined ?? '')).toBe(1)
  })

  it('queues a second member behind the first', () => {
    const { result } = renderWaitlist()

    act(() => {
      result.current.waitlist.join({ ...SLOT, memberId: 'm-ilra' })
    })
    act(() => {
      result.current.waitlist.join({ ...SLOT, memberId: 'm-tomas' })
    })

    const queue = result.current.waitlist.entriesForSlot(SLOT)
    expect(queue.map((entry) => entry.memberId)).toEqual(['m-ilra', 'm-tomas'])
    expect(result.current.waitlist.positionOf(queue[1].id)).toBe(2)
  })

  it('refuses to queue the same member twice for one slot', () => {
    const { result } = renderWaitlist()

    act(() => {
      result.current.waitlist.join({ ...SLOT, memberId: 'm-ilra' })
    })

    let refusal: string | undefined
    act(() => {
      const outcome = result.current.waitlist.join({ ...SLOT, memberId: 'm-ilra' })
      refusal = outcome.ok ? undefined : outcome.reason
    })

    expect(refusal).toBe('duplicate')
    expect(result.current.waitlist.entries).toHaveLength(1)
  })

  it('refuses a slot that could never be booked', () => {
    const { result } = renderWaitlist()

    let refusal: string | undefined
    act(() => {
      const outcome = result.current.waitlist.join({
        ...SLOT,
        endMinute: SLOT.startMinute,
        memberId: 'm-ilra',
      })
      refusal = outcome.ok ? undefined : outcome.reason
    })

    expect(refusal).toBe('malformed-slot')
    expect(result.current.waitlist.entries).toEqual([])
  })

  it('renumbers the queue when somebody leaves the middle of it', () => {
    seed([{ memberId: 'm-ilra' }, { memberId: 'm-tomas' }, { memberId: 'm-nour' }])
    const { result } = renderWaitlist()

    let left: boolean | undefined
    act(() => {
      left = result.current.waitlist.leave('wl-2')
    })

    expect(left).toBe(true)
    expect(result.current.waitlist.positionOf('wl-3')).toBe(2)
    expect(result.current.waitlist.positionOf('wl-2')).toBe(0)
  })

  it('ignores a leave for an entry nobody holds', () => {
    const { result } = renderWaitlist()

    let left: boolean | undefined
    act(() => {
      left = result.current.waitlist.leave('wl-9999')
    })

    expect(left).toBe(false)
  })

  it('answers what one member is waiting for', () => {
    seed([
      { memberId: 'm-ilra' },
      { memberId: 'm-tomas' },
      { memberId: 'm-ilra', ...OTHER_SLOT },
    ])
    const { result } = renderWaitlist()

    expect(result.current.waitlist.entriesForMember('m-ilra').map((e) => e.id)).toEqual([
      'wl-1',
      'wl-3',
    ])
    expect(result.current.waitlist.entriesForMember('m-pia')).toEqual([])
  })

  it('promotes nobody from an empty queue', async () => {
    const { result } = renderWaitlist()

    let outcome: Awaited<ReturnType<typeof result.current.waitlist.promote>> | undefined
    await act(async () => {
      outcome = await result.current.waitlist.promote(SLOT)
    })

    expect(outcome?.promoted).toBeNull()
    expect(outcome?.skipped).toEqual([])
    expect(result.current.board.bookings).toEqual([])
  })

  it('books the freed slot for the first member in the queue', async () => {
    seed([{ memberId: 'm-ilra' }, { memberId: 'm-tomas' }])
    const { result } = renderWaitlist()

    let outcome: Awaited<ReturnType<typeof result.current.waitlist.promote>> | undefined
    await act(async () => {
      outcome = await result.current.waitlist.promote(SLOT)
    })

    expect(outcome?.promoted?.memberId).toBe('m-ilra')
    expect(outcome?.booking?.memberId).toBe('m-ilra')
    expect(result.current.board.bookings).toHaveLength(1)
    expect(result.current.board.bookings[0]).toMatchObject({
      machineId: 'laser-a',
      startMinute: SLOT.startMinute,
    })

    // The promoted member leaves the queue; the one behind moves up.
    expect(result.current.waitlist.entriesForSlot(SLOT).map((e) => e.id)).toEqual(['wl-2'])
    expect(result.current.waitlist.positionOf('wl-2')).toBe(1)
  })

  it('carries the waiting member\'s note onto the booking', async () => {
    seed([{ memberId: 'm-ilra', note: 'Lamp base' }])
    const { result } = renderWaitlist()

    await act(async () => {
      await result.current.waitlist.promote(SLOT)
    })

    expect(result.current.board.bookings[0].note).toBe('Lamp base')
  })

  it('skips the head of the queue when they no longer qualify', async () => {
    // Pia holds no laser sign-off, so the slot passes to Tomas behind her.
    seed([{ memberId: 'm-pia' }, { memberId: 'm-tomas' }])
    const { result } = renderWaitlist()

    let outcome: Awaited<ReturnType<typeof result.current.waitlist.promote>> | undefined
    await act(async () => {
      outcome = await result.current.waitlist.promote(SLOT)
    })

    expect(outcome?.promoted?.memberId).toBe('m-tomas')
    expect(outcome?.skipped).toHaveLength(1)
    expect(outcome?.skipped[0].rejections.map((r) => r.code)).toContain('missing-ticket')
    expect(result.current.waitlist.entries).toEqual([])
  })

  it('clears the queue when nobody left in it qualifies', async () => {
    seed([{ memberId: 'm-pia' }, { memberId: 'm-nour' }])
    const { result } = renderWaitlist()

    let outcome: Awaited<ReturnType<typeof result.current.waitlist.promote>> | undefined
    await act(async () => {
      outcome = await result.current.waitlist.promote(SLOT)
    })

    expect(outcome?.promoted).toBeNull()
    expect(outcome?.skipped.map((skip) => skip.entry.memberId)).toEqual(['m-pia', 'm-nour'])
    expect(result.current.board.bookings).toEqual([])
    expect(result.current.waitlist.entries).toEqual([])
  })

  it('passes over a member the server refuses and takes the next one', async () => {
    seed([{ memberId: 'm-ilra' }, { memberId: 'm-tomas' }])
    const { result } = renderWaitlist()

    vi.spyOn(api, 'createBooking').mockRejectedValueOnce(
      new api.BookingRejectedError([
        { code: 'overlaps-booking', message: 'Somebody booked it first.' },
      ]),
    )

    let outcome: Awaited<ReturnType<typeof result.current.waitlist.promote>> | undefined
    await act(async () => {
      outcome = await result.current.waitlist.promote(SLOT)
    })

    expect(outcome?.promoted?.memberId).toBe('m-tomas')
    expect(outcome?.skipped.map((skip) => skip.entry.memberId)).toEqual(['m-ilra'])
    expect(result.current.board.bookings).toHaveLength(1)
    expect(result.current.board.bookings[0].memberId).toBe('m-tomas')
  })

  it('leaves other slots\' queues alone', async () => {
    seed([{ memberId: 'm-ilra', ...OTHER_SLOT }, { memberId: 'm-tomas' }])
    const { result } = renderWaitlist()

    await act(async () => {
      await result.current.waitlist.promote(SLOT)
    })

    expect(result.current.waitlist.entriesForSlot(OTHER_SLOT).map((e) => e.id)).toEqual(['wl-1'])
    expect(result.current.board.bookings[0].memberId).toBe('m-tomas')
  })

  it('keeps a place taken while the promotion was in flight', async () => {
    api.configureLatency(20)
    seed([{ memberId: 'm-ilra' }])
    const { result } = renderWaitlist()

    let pending: Promise<unknown> | undefined
    act(() => {
      pending = result.current.waitlist.promote(SLOT)
    })
    act(() => {
      result.current.waitlist.join({ ...OTHER_SLOT, memberId: 'm-pia' })
    })
    await act(async () => {
      await pending
    })

    expect(result.current.waitlist.entries.map((entry) => entry.memberId)).toEqual(['m-pia'])
  })

  it('keeps the queue across a remount', async () => {
    const first = renderWaitlist()
    act(() => {
      first.result.current.waitlist.join({ ...SLOT, memberId: 'm-ilra' })
    })
    first.unmount()

    const second = renderWaitlist()

    await waitFor(() => expect(second.result.current.waitlist.entries).toHaveLength(1))
  })

  it('discards a persisted queue that does not match the schema', () => {
    window.localStorage.setItem('benchclock:waitlist:v1', JSON.stringify([{ id: 'wl-1' }]))

    const { result } = renderWaitlist()

    expect(result.current.waitlist.entries).toEqual([])
  })

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useWaitlist())).toThrow(
      /useWaitlist must be used inside a <WaitlistProvider>/,
    )
  })
})
