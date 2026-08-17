import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { SeriesDraft } from '@/lib/recurrence'
import { weekMinute } from '@/lib/weektime'
import { SeriesProvider } from '@/state/SeriesProvider'
import { useSeries } from '@/state/series-context'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const STORAGE_KEY = 'benchclock:series:v1'

const draft = (over: Partial<SeriesDraft> = {}): SeriesDraft => ({
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  repeatCount: 3,
  mode: 'skip-refused',
  ...over,
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <SeriesProvider>{children}</SeriesProvider>
)
const renderSeries = () => renderHook(() => useSeries(), { wrapper })

function seed(value: unknown) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

const stored = (over: Record<string, unknown> = {}) => ({
  id: 'sr-0001',
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  repeatCount: 2,
  mode: 'skip-refused',
  createdAt: 1,
  ...over,
})

describe('SeriesProvider', () => {
  it('starts with no series', () => {
    const { result } = renderSeries()

    expect(result.current.series).toEqual([])
  })

  it('stores a series under the first free id', () => {
    const { result } = renderSeries()

    let created: ReturnType<typeof result.current.addSeries> | undefined
    act(() => {
      created = result.current.addSeries(draft())
    })

    expect(created?.id).toBe('sr-0001')
    expect(result.current.series).toHaveLength(1)
    expect(result.current.series[0]).toMatchObject({ id: 'sr-0001', repeatCount: 3 })
  })

  it('gives each new series its own id', () => {
    const { result } = renderSeries()

    act(() => {
      result.current.addSeries(draft())
      result.current.addSeries(draft({ startMinute: at(1, 18), endMinute: at(1, 19) }))
    })

    expect(result.current.series.map((s) => s.id)).toEqual(['sr-0001', 'sr-0002'])
  })

  it('reuses the id of a cancelled series', () => {
    const { result } = renderSeries()

    act(() => {
      result.current.addSeries(draft())
      result.current.addSeries(draft({ startMinute: at(1, 18), endMinute: at(1, 19) }))
    })
    act(() => {
      result.current.cancelSeries('sr-0001')
    })

    let created: ReturnType<typeof result.current.addSeries> | undefined
    act(() => {
      created = result.current.addSeries(draft({ startMinute: at(2, 18), endMinute: at(2, 19) }))
    })

    expect(created?.id).toBe('sr-0001')
    expect(result.current.series.map((s) => s.id)).toEqual(['sr-0002', 'sr-0001'])
  })

  it('cancels a whole series at once', () => {
    const { result } = renderSeries()

    act(() => {
      result.current.addSeries(draft())
    })

    let cancelled: boolean | undefined
    act(() => {
      cancelled = result.current.cancelSeries('sr-0001')
    })

    expect(cancelled).toBe(true)
    expect(result.current.series).toEqual([])
  })

  it('ignores a cancel for an id it does not hold', () => {
    const { result } = renderSeries()

    let cancelled: boolean | undefined
    act(() => {
      cancelled = result.current.cancelSeries('sr-9999')
    })

    expect(cancelled).toBe(false)
  })

  it('lists one member’s series in slot order', () => {
    const { result } = renderSeries()

    act(() => {
      result.current.addSeries(draft({ startMinute: at(2, 20), endMinute: at(2, 21) }))
      result.current.addSeries(draft({ startMinute: at(0, 18), endMinute: at(0, 19) }))
      result.current.addSeries(draft({ memberId: 'm-pia', machineId: 'printer-b' }))
    })

    const mine = result.current.seriesForMember('m-ilra')

    expect(mine).toHaveLength(2)
    expect(mine.map((s) => s.startMinute)).toEqual([at(0, 18), at(2, 20)])
    expect(result.current.seriesForMember('m-pia')).toHaveLength(1)
    expect(result.current.seriesForMember('m-nour')).toEqual([])
  })

  it('expands the occurrences that fall in a given week', () => {
    const { result } = renderSeries()

    act(() => {
      result.current.addSeries(draft({ repeatCount: 2 }))
      result.current.addSeries(
        draft({ repeatCount: 3, startMinute: at(1, 18), endMinute: at(1, 19) }),
      )
    })

    expect(result.current.occurrencesInWeek(0)).toHaveLength(2)
    expect(result.current.occurrencesInWeek(1)).toHaveLength(2)
    expect(result.current.occurrencesInWeek(2).map((o) => o.id)).toEqual(['sr-0002#w2'])
    expect(result.current.occurrencesInWeek(3)).toEqual([])
  })

  it('persists series across a remount', async () => {
    const first = renderSeries()
    act(() => {
      first.result.current.addSeries(draft())
    })
    first.unmount()

    const second = renderSeries()

    await waitFor(() => expect(second.result.current.series).toHaveLength(1))
    expect(second.result.current.series[0].id).toBe('sr-0001')
  })

  it('reads a series written by an earlier session', () => {
    seed([stored()])

    const { result } = renderSeries()

    expect(result.current.series).toHaveLength(1)
    expect(result.current.occurrencesInWeek(1)).toHaveLength(1)
  })

  it('discards a stored value that is not a list', () => {
    seed({ id: 'sr-0001' })

    expect(renderSeries().result.current.series).toEqual([])
  })

  it('discards a series missing its fields', () => {
    seed([{ id: 'sr-0001' }])

    expect(renderSeries().result.current.series).toEqual([])
  })

  it('discards a series with a repeat mode it does not know', () => {
    seed([stored({ mode: 'every-other-week' })])

    expect(renderSeries().result.current.series).toEqual([])
  })

  it('discards a series whose slot is not numeric', () => {
    seed([stored({ startMinute: '18:00' })])

    expect(renderSeries().result.current.series).toEqual([])
  })

  it('discards a stored list that repeats an id', () => {
    seed([stored(), stored({ startMinute: at(1, 18) })])

    expect(renderSeries().result.current.series).toEqual([])
  })

  it('survives storage that cannot be read', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json')

    expect(renderSeries().result.current.series).toEqual([])
  })

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useSeries())).toThrow(
      /useSeries must be used inside a <SeriesProvider>/,
    )
  })
})
