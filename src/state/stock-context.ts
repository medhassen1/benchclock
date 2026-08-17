import { createContext, useContext } from 'react'

import type { Consumable } from '@/data/consumables'
import type { Enrolment } from '@/lib/inductions'
import type { DrawOutcome, StockLevels } from '@/lib/stock'

/**
 * Own keys rather than entries in `STORAGE_KEYS`, so the shelf and the seat
 * list version independently of the board's own storage.
 */
export const STOCK_STORAGE_KEYS = {
  stock: 'benchclock:stock:v1',
  enrolments: 'benchclock:enrolments:v1',
} as const

export interface StockContextValue {
  levels: StockLevels
  enrolments: readonly Enrolment[]
  /** Takes stock off the shelf, clamped at zero; the outcome names the shortfall. */
  draw: (itemId: string, amount: number) => DrawOutcome
  restock: (itemId: string, amount: number) => void
  /** False when the seat could not be taken: already held, or the room is full. */
  enrol: (inductionId: string, memberId: string) => boolean
  withdraw: (inductionId: string, memberId: string) => boolean
  quantityOf: (itemId: string) => number
  isLow: (itemId: string) => boolean
  /** Everything at or below its reorder threshold, emptiest first. */
  lowStock: readonly Consumable[]
  seatsTakenFor: (inductionId: string) => number
  isEnrolled: (inductionId: string, memberId: string) => boolean
  enrolmentsForMember: (memberId: string) => readonly Enrolment[]
}

export const StockContext = createContext<StockContextValue | null>(null)

export function useStock(): StockContextValue {
  const context = useContext(StockContext)
  if (!context) {
    throw new Error('useStock must be used inside a <StockProvider>')
  }
  return context
}
