import { useCallback, useMemo, useRef, type ReactNode } from 'react'

import { usePersistentState } from '@/hooks/usePersistentState'
import {
  expandSeries,
  makeSeriesId,
  SERIES_MODES,
  type SeriesDefinition,
  type SeriesDraft,
  type SeriesMode,
  type SeriesOccurrence,
} from '@/lib/recurrence'

import { SeriesContext } from './series-context'

/** Series live beside the board rather than in it: the board holds one week. */
const SERIES_STORAGE_KEY = 'benchclock:series:v1'

function isSeriesMode(raw: unknown): raw is SeriesMode {
  return typeof raw === 'string' && SERIES_MODES.includes(raw as SeriesMode)
}

function isSeriesDefinition(raw: unknown): raw is SeriesDefinition {
  if (typeof raw !== 'object' || raw === null) return false
  const v = raw as Record<string, unknown>

  return (
    typeof v.id === 'string' &&
    typeof v.machineId === 'string' &&
    typeof v.memberId === 'string' &&
    typeof v.startMinute === 'number' &&
    typeof v.endMinute === 'number' &&
    typeof v.note === 'string' &&
    typeof v.repeatCount === 'number' &&
    typeof v.createdAt === 'number' &&
    isSeriesMode(v.mode)
  )
}

/**
 * Rejects anything an older build — or a hand-edited store — could leave
 * behind. Duplicate ids are refused too, since ids are handed out by finding
 * the first free one and a repeat would make cancelling ambiguous.
 */
function parseSeries(raw: unknown): SeriesDefinition[] | null {
  if (!Array.isArray(raw) || !raw.every(isSeriesDefinition)) return null

  const ids = new Set(raw.map((definition) => definition.id))
  return ids.size === raw.length ? raw : null
}

/**
 * Holds the recurring bookings a member has set up. Only the definitions are
 * persisted; the occurrences are expanded on demand, so changing the rules
 * never leaves a stale copy of a week behind.
 */
export function SeriesProvider({ children }: { children: ReactNode }) {
  const [series, setSeries] = usePersistentState<SeriesDefinition[]>(
    SERIES_STORAGE_KEY,
    [],
    parseSeries,
  )

  // Holds the freshest list without the callbacks depending on `series`. It is
  // written straight away on every change so two calls in one tick — adding a
  // series and reading back its id — cannot both claim the same id.
  const latest = useRef(series)
  latest.current = series

  const addSeries = useCallback(
    (draft: SeriesDraft): SeriesDefinition => {
      const definition: SeriesDefinition = {
        ...draft,
        id: makeSeriesId(latest.current.map((existing) => existing.id)),
        createdAt: Date.now(),
      }

      latest.current = [...latest.current, definition]
      setSeries(latest.current)
      return definition
    },
    [setSeries],
  )

  const cancelSeries = useCallback(
    (seriesId: string): boolean => {
      if (!latest.current.some((definition) => definition.id === seriesId)) return false

      latest.current = latest.current.filter((definition) => definition.id !== seriesId)
      setSeries(latest.current)
      return true
    },
    [setSeries],
  )

  const seriesForMember = useCallback(
    (memberId: string) =>
      series
        .filter((definition) => definition.memberId === memberId)
        .sort((a, b) => a.startMinute - b.startMinute),
    [series],
  )

  const occurrencesInWeek = useCallback(
    (weekIndex: number): readonly SeriesOccurrence[] =>
      series.flatMap((definition) =>
        expandSeries(definition).filter((occurrence) => occurrence.weekIndex === weekIndex),
      ),
    [series],
  )

  const value = useMemo(
    () => ({ series, addSeries, cancelSeries, seriesForMember, occurrencesInWeek }),
    [series, addSeries, cancelSeries, seriesForMember, occurrencesInWeek],
  )

  return <SeriesContext.Provider value={value}>{children}</SeriesContext.Provider>
}
