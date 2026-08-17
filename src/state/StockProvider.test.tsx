import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { openingLevels } from '@/lib/stock'
import { StockProvider } from '@/state/StockProvider'
import { STOCK_STORAGE_KEYS, useStock } from '@/state/stock-context'

const wrapper = ({ children }: { children: ReactNode }) => <StockProvider>{children}</StockProvider>
const renderStock = () => renderHook(() => useStock(), { wrapper })

const seedStock = (levels: unknown) =>
  window.localStorage.setItem(STOCK_STORAGE_KEYS.stock, JSON.stringify(levels))

const seedEnrolments = (enrolments: unknown) =>
  window.localStorage.setItem(STOCK_STORAGE_KEYS.enrolments, JSON.stringify(enrolments))

const stored = (key: string): unknown => JSON.parse(window.localStorage.getItem(key) ?? 'null')

describe('StockProvider stock levels', () => {
  it('starts at the opening quantities', () => {
    const { result } = renderStock()

    expect(result.current.levels).toEqual(openingLevels())
    expect(result.current.quantityOf('ply-3mm')).toBe(24)
  })

  it('draws stock off the shelf', () => {
    const { result } = renderStock()

    act(() => {
      result.current.draw('ply-3mm', 4)
    })

    expect(result.current.quantityOf('ply-3mm')).toBe(20)
  })

  it('reports the shortfall when more is drawn than exists', () => {
    const { result } = renderStock()

    let outcome: ReturnType<typeof result.current.draw> | undefined
    act(() => {
      outcome = result.current.draw('resin', 10)
    })

    expect(outcome?.drawn).toBe(4)
    expect(outcome?.shortfall).toBe(6)
    expect(result.current.quantityOf('resin')).toBe(0)
  })

  it('draws twice in a row from the freshest levels', () => {
    const { result } = renderStock()

    act(() => {
      result.current.draw('ply-3mm', 4)
      result.current.draw('ply-3mm', 6)
    })

    expect(result.current.quantityOf('ply-3mm')).toBe(14)
  })

  it('restocks an item back from zero', () => {
    const { result } = renderStock()

    act(() => {
      result.current.draw('resin', 4)
    })
    expect(result.current.isLow('resin')).toBe(true)

    act(() => {
      result.current.restock('resin', 4)
    })

    expect(result.current.quantityOf('resin')).toBe(4)
    expect(result.current.isLow('resin')).toBe(false)
  })

  it('flags an item sitting exactly on its threshold', () => {
    const { result } = renderStock()

    // Welding wire opens at 3 kg with a threshold of 3 kg.
    expect(result.current.isLow('welding-wire')).toBe(true)
    expect(result.current.lowStock.map((item) => item.id)).toContain('welding-wire')
  })

  it('says nothing is low for an item it has never heard of', () => {
    const { result } = renderStock()

    expect(result.current.isLow('unobtainium')).toBe(false)
    expect(result.current.quantityOf('unobtainium')).toBe(0)
  })

  it('persists the shelf across a remount', async () => {
    const first = renderStock()
    act(() => {
      first.result.current.draw('ply-3mm', 10)
    })
    first.unmount()

    const second = renderStock()

    await waitFor(() => expect(second.result.current.quantityOf('ply-3mm')).toBe(14))
    expect(stored(STOCK_STORAGE_KEYS.stock)).toMatchObject({ 'ply-3mm': 14 })
  })

  it('discards a persisted shelf that does not match the schema', () => {
    seedStock({ 'ply-3mm': 'plenty' })

    expect(renderStock().result.current.levels).toEqual(openingLevels())
  })

  it('discards a shelf holding a negative quantity', () => {
    seedStock({ 'ply-3mm': -4 })

    expect(renderStock().result.current.levels).toEqual(openingLevels())
  })

  it('discards a shelf stored as an array', () => {
    seedStock([1, 2, 3])

    expect(renderStock().result.current.levels).toEqual(openingLevels())
  })

  it('ignores an item that is no longer stocked, keeping the rest', () => {
    seedStock({ 'ply-3mm': 2, 'unobtainium': 99 })
    const { result } = renderStock()

    expect(result.current.quantityOf('ply-3mm')).toBe(2)
    expect(result.current.quantityOf('unobtainium')).toBe(0)
  })

  it('fills in a consumable the stored shelf never knew about', () => {
    seedStock({ 'ply-3mm': 2 })

    expect(renderStock().result.current.quantityOf('resin')).toBe(4)
  })
})

describe('StockProvider enrolments', () => {
  it('starts with no seats taken', () => {
    const { result } = renderStock()

    expect(result.current.enrolments).toEqual([])
    expect(result.current.seatsTakenFor('ind-laser-mon')).toBe(0)
  })

  it('takes a seat on a session', () => {
    const { result } = renderStock()

    let ok: boolean | undefined
    act(() => {
      ok = result.current.enrol('ind-laser-mon', 'm-pia')
    })

    expect(ok).toBe(true)
    expect(result.current.isEnrolled('ind-laser-mon', 'm-pia')).toBe(true)
    expect(result.current.seatsTakenFor('ind-laser-mon')).toBe(1)
  })

  it('refuses a second seat for the same member', () => {
    const { result } = renderStock()

    act(() => {
      result.current.enrol('ind-laser-mon', 'm-pia')
    })

    let ok: boolean | undefined
    act(() => {
      ok = result.current.enrol('ind-laser-mon', 'm-pia')
    })

    expect(ok).toBe(false)
    expect(result.current.seatsTakenFor('ind-laser-mon')).toBe(1)
  })

  it('refuses a seat on a full session', () => {
    // The Sunday textiles session seats two.
    seedEnrolments([
      { inductionId: 'ind-textiles-sun', memberId: 'm-tomas' },
      { inductionId: 'ind-textiles-sun', memberId: 'm-nour' },
    ])
    const { result } = renderStock()

    let ok: boolean | undefined
    act(() => {
      ok = result.current.enrol('ind-textiles-sun', 'm-pia')
    })

    expect(ok).toBe(false)
    expect(result.current.seatsTakenFor('ind-textiles-sun')).toBe(2)
  })

  it('refuses a seat on a session that is not in the timetable', () => {
    const { result } = renderStock()

    let ok: boolean | undefined
    act(() => {
      ok = result.current.enrol('ind-ghost', 'm-pia')
    })

    expect(ok).toBe(false)
    expect(result.current.enrolments).toEqual([])
  })

  it('gives a seat up, freeing it for someone else', () => {
    const { result } = renderStock()

    act(() => {
      result.current.enrol('ind-textiles-sun', 'm-pia')
    })

    let ok: boolean | undefined
    act(() => {
      ok = result.current.withdraw('ind-textiles-sun', 'm-pia')
    })

    expect(ok).toBe(true)
    expect(result.current.seatsTakenFor('ind-textiles-sun')).toBe(0)
  })

  it('ignores a withdrawal from a seat the member never held', () => {
    const { result } = renderStock()

    let ok: boolean | undefined
    act(() => {
      ok = result.current.withdraw('ind-laser-mon', 'm-pia')
    })

    expect(ok).toBe(false)
  })

  it('lists the seats one member holds', () => {
    const { result } = renderStock()

    act(() => {
      result.current.enrol('ind-laser-mon', 'm-pia')
      result.current.enrol('ind-textiles-sun', 'm-pia')
      result.current.enrol('ind-laser-mon', 'm-nour')
    })

    expect(result.current.enrolmentsForMember('m-pia')).toHaveLength(2)
    expect(result.current.enrolmentsForMember('m-nour')).toHaveLength(1)
  })

  it('persists seats across a remount', async () => {
    const first = renderStock()
    act(() => {
      first.result.current.enrol('ind-laser-mon', 'm-pia')
    })
    first.unmount()

    const second = renderStock()

    await waitFor(() => expect(second.result.current.seatsTakenFor('ind-laser-mon')).toBe(1))
  })

  it('discards a persisted seat list that does not match the schema', () => {
    seedEnrolments([{ inductionId: 7 }])

    expect(renderStock().result.current.enrolments).toEqual([])
  })

  it('drops seats on a session or member that no longer exists', () => {
    seedEnrolments([
      { inductionId: 'ind-gone', memberId: 'm-pia' },
      { inductionId: 'ind-laser-mon', memberId: 'm-ghost' },
      { inductionId: 'ind-laser-mon', memberId: 'm-pia' },
    ])

    expect(renderStock().result.current.enrolments).toEqual([
      { inductionId: 'ind-laser-mon', memberId: 'm-pia' },
    ])
  })

  it('drops a duplicated seat so capacity is counted once', () => {
    seedEnrolments([
      { inductionId: 'ind-laser-mon', memberId: 'm-pia' },
      { inductionId: 'ind-laser-mon', memberId: 'm-pia' },
    ])

    expect(renderStock().result.current.seatsTakenFor('ind-laser-mon')).toBe(1)
  })
})

describe('useStock', () => {
  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useStock())).toThrow(
      /useStock must be used inside a <StockProvider>/,
    )
  })
})
