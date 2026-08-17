import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AUDIT_STORAGE_KEY, type AuditEntry } from '@/lib/audit'
import { AuditProvider } from '@/state/AuditProvider'
import { useAudit, useOptionalAudit } from '@/state/audit-context'

const AT = 1_786_989_840_000

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'au-0001',
  actorId: 'm-ilra',
  action: 'booking-created',
  subject: 'laser-a',
  details: 'Mon 18:00 – 19:00',
  at: AT,
  ...over,
})

function seed(value: unknown) {
  window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(value))
}

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(AUDIT_STORAGE_KEY) ?? 'null')
}

const renderAudit = (limit?: number) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuditProvider limit={limit}>{children}</AuditProvider>
  )
  return renderHook(() => useAudit(), { wrapper })
}

describe('AuditProvider', () => {
  it('starts with an empty trail', () => {
    const { result } = renderAudit()

    expect(result.current.entries).toEqual([])
    expect(result.current.query()).toEqual([])
  })

  it('records an entry and gives it an id and a timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(AT)
    const { result } = renderAudit()

    let recorded: AuditEntry | undefined
    act(() => {
      recorded = result.current.record({
        actorId: 'm-ilra',
        action: 'booking-created',
        subject: 'laser-a',
      })
    })

    expect(recorded).toEqual({
      id: 'au-0001',
      actorId: 'm-ilra',
      action: 'booking-created',
      subject: 'laser-a',
      details: '',
      at: AT,
    })
    expect(result.current.entries).toEqual([recorded])
  })

  it('takes a supplied timestamp over the clock', () => {
    const { result } = renderAudit()

    act(() => {
      result.current.record({
        actorId: 'm-pia',
        action: 'member-switched',
        subject: 'm-pia',
        at: 7,
      })
    })

    expect(result.current.entries[0].at).toBe(7)
  })

  it('keeps the trail in the order it was written and numbers ids in sequence', () => {
    const { result } = renderAudit()

    act(() => {
      result.current.record({ actorId: 'm-ilra', action: 'booking-created', subject: 'laser-a' })
      result.current.record({ actorId: 'm-ilra', action: 'booking-cancelled', subject: 'laser-a' })
    })

    expect(result.current.entries.map((e) => e.id)).toEqual(['au-0001', 'au-0002'])
  })

  it('persists the trail under its own key', () => {
    const { result } = renderAudit()

    act(() => {
      result.current.record({
        actorId: 'm-ilra',
        action: 'bookings-exported',
        subject: 'CSV',
        details: '2 bookings',
        at: AT,
      })
    })

    expect(stored()).toEqual([
      {
        id: 'au-0001',
        actorId: 'm-ilra',
        action: 'bookings-exported',
        subject: 'CSV',
        details: '2 bookings',
        at: AT,
      },
    ])
  })

  it('restores a persisted trail', () => {
    seed([entry({ id: 'au-0001' }), entry({ id: 'au-0002' })])
    const { result } = renderAudit()

    expect(result.current.entries.map((e) => e.id)).toEqual(['au-0001', 'au-0002'])
  })

  it('carries on numbering after the highest id it restored', () => {
    seed([entry({ id: 'au-0009' })])
    const { result } = renderAudit()

    act(() => {
      result.current.record({ actorId: 'm-ilra', action: 'booking-created', subject: 'laser-a' })
    })

    expect(result.current.entries.map((e) => e.id)).toEqual(['au-0009', 'au-0010'])
  })

  it('drops entries an older build wrote in a shape it no longer understands', () => {
    seed([
      entry({ id: 'au-0001' }),
      { id: 'au-0002' },
      { ...entry({ id: 'au-0003' }), action: 'nope' },
    ])
    const { result } = renderAudit()

    expect(result.current.entries.map((e) => e.id)).toEqual(['au-0001'])
  })

  it('falls back to an empty trail when the stored value is not a list', () => {
    seed({ entries: [] })
    const { result } = renderAudit()

    expect(result.current.entries).toEqual([])
  })

  it('survives a value that is not JSON at all', () => {
    window.localStorage.setItem(AUDIT_STORAGE_KEY, '{oops')
    const { result } = renderAudit()

    expect(result.current.entries).toEqual([])
  })

  it('trims the oldest entries once the cap is reached', () => {
    const { result } = renderAudit(2)

    act(() => {
      result.current.record({ actorId: 'm-ilra', action: 'booking-created', subject: 'laser-a' })
      result.current.record({ actorId: 'm-ilra', action: 'booking-created', subject: 'laser-b' })
      result.current.record({ actorId: 'm-ilra', action: 'booking-created', subject: 'cnc-a' })
    })

    expect(result.current.entries.map((e) => e.id)).toEqual(['au-0002', 'au-0003'])
    expect(result.current.entries.map((e) => e.subject)).toEqual(['laser-b', 'cnc-a'])
  })

  it('trims a stored trail that is already over the cap', () => {
    const overflowing = Array.from({ length: 205 }, (_, index) =>
      entry({ id: `au-${String(index + 1).padStart(4, '0')}`, at: AT + index }),
    )
    seed(overflowing)
    const { result } = renderAudit()

    expect(result.current.entries).toHaveLength(200)
    expect(result.current.entries[0].id).toBe('au-0006')
  })

  it('queries newest first and filters by actor, action, and subject', () => {
    const { result } = renderAudit()

    act(() => {
      result.current.record({
        actorId: 'm-ilra',
        action: 'booking-created',
        subject: 'laser-a',
        at: AT,
      })
      result.current.record({
        actorId: 'm-pia',
        action: 'booking-cancelled',
        subject: 'printer-b',
        at: AT + 1_000,
      })
    })

    expect(result.current.query().map((e) => e.id)).toEqual(['au-0002', 'au-0001'])
    expect(result.current.query({ actorId: 'm-pia' }).map((e) => e.id)).toEqual(['au-0002'])
    const created = result.current.query({ action: 'booking-created' })

    expect(created.map((e) => e.id)).toEqual(['au-0001'])
    expect(result.current.query({ subject: 'printer-b' }).map((e) => e.id)).toEqual(['au-0002'])
  })

  it('clears the trail and the stored copy', () => {
    seed([entry()])
    const { result } = renderAudit()

    act(() => {
      result.current.clear()
    })

    expect(result.current.entries).toEqual([])
    expect(stored()).toEqual([])
  })

  it('keeps issuing fresh ids after a clear', () => {
    seed([entry({ id: 'au-0004' })])
    const { result } = renderAudit()

    act(() => {
      result.current.clear()
      result.current.record({ actorId: 'm-ilra', action: 'booking-created', subject: 'laser-a' })
    })

    expect(result.current.entries.map((e) => e.id)).toEqual(['au-0005'])
  })

  it('refuses to be used outside the provider', () => {
    // React logs the thrown error before the boundary catches it.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAudit())).toThrow(/inside an <AuditProvider>/)
  })

  it('lets an optional consumer render without the provider', () => {
    const { result } = renderHook(() => useOptionalAudit())

    expect(result.current).toBeNull()
  })
})
