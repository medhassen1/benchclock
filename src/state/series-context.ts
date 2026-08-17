import { createContext, useContext } from 'react'

import type { SeriesDefinition, SeriesDraft, SeriesOccurrence } from '@/lib/recurrence'

export interface SeriesContextValue {
  series: readonly SeriesDefinition[]
  /** Stores a definition under the next free id and hands it back. */
  addSeries: (draft: SeriesDraft) => SeriesDefinition
  /** Drops a whole series; false when no series holds that id. */
  cancelSeries: (seriesId: string) => boolean
  seriesForMember: (memberId: string) => readonly SeriesDefinition[]
  /** Every occurrence, of every series, that lands in `weekIndex`. */
  occurrencesInWeek: (weekIndex: number) => readonly SeriesOccurrence[]
}

export const SeriesContext = createContext<SeriesContextValue | null>(null)

export function useSeries(): SeriesContextValue {
  const context = useContext(SeriesContext)
  if (!context) {
    throw new Error('useSeries must be used inside a <SeriesProvider>')
  }
  return context
}
