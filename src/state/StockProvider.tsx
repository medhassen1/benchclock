import { useCallback, useMemo, useRef, type ReactNode } from 'react'

import { CONSUMABLES_BY_ID } from '@/data/consumables'
import { INDUCTIONS_BY_ID } from '@/data/inductions'
import { MEMBERS_BY_ID } from '@/data/workshop'
import { usePersistentState } from '@/hooks/usePersistentState'
import * as inductions from '@/lib/inductions'
import type { Enrolment } from '@/lib/inductions'
import * as stock from '@/lib/stock'
import type { DrawOutcome, StockLevels } from '@/lib/stock'

import { StockContext, STOCK_STORAGE_KEYS } from './stock-context'

/**
 * A persisted shelf is trusted only as far as it looks like one: an object of
 * non-negative numbers. Anything else came from an older build or a hand-edited
 * store, and is dropped in favour of the opening quantities.
 */
function parseLevels(raw: unknown): StockLevels | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const entries = Object.entries(raw as Record<string, unknown>)
  const kept: Record<string, number> = {}

  for (const [itemId, quantity] of entries) {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) return null
    // An item retired between visits keeps no shelf space.
    if (CONSUMABLES_BY_ID.has(itemId)) kept[itemId] = quantity
  }

  // Merged over the openings so a consumable added since the last visit starts
  // full rather than missing.
  return { ...stock.openingLevels(), ...kept }
}

function isEnrolment(raw: unknown): raw is Enrolment {
  if (typeof raw !== 'object' || raw === null) return false
  const value = raw as Record<string, unknown>

  return typeof value.inductionId === 'string' && typeof value.memberId === 'string'
}

/**
 * Seats survive a reload only when both ends of them still exist, so a session
 * dropped from the timetable cannot go on consuming capacity.
 */
function parseEnrolments(raw: unknown): Enrolment[] | null {
  if (!Array.isArray(raw) || !raw.every(isEnrolment)) return null

  const seen = new Set<string>()
  const kept: Enrolment[] = []

  for (const enrolment of raw) {
    const key = `${enrolment.inductionId}/${enrolment.memberId}`
    if (seen.has(key)) continue
    if (!INDUCTIONS_BY_ID.has(enrolment.inductionId)) continue
    if (!MEMBERS_BY_ID.has(enrolment.memberId)) continue

    seen.add(key)
    kept.push({ inductionId: enrolment.inductionId, memberId: enrolment.memberId })
  }

  return kept
}

/**
 * Holds the consumable shelf and the induction seat list. Both are local
 * bookkeeping rather than board state, so writes land straight away and are
 * persisted; there is no server to refuse them.
 */
export function StockProvider({ children }: { children: ReactNode }) {
  const [levels, setLevels] = usePersistentState<StockLevels>(
    STOCK_STORAGE_KEYS.stock,
    stock.openingLevels(),
    parseLevels,
  )
  const [enrolments, setEnrolments] = usePersistentState<Enrolment[]>(
    STOCK_STORAGE_KEYS.enrolments,
    [],
    parseEnrolments,
  )

  // Lets a caller learn the shortfall of a draw in the same tick it is made,
  // without the callbacks depending on the current levels.
  const latestLevels = useRef(levels)
  latestLevels.current = levels

  const latestEnrolments = useRef(enrolments)
  latestEnrolments.current = enrolments

  const draw = useCallback(
    (itemId: string, amount: number): DrawOutcome => {
      const outcome = stock.applyDraw(latestLevels.current, itemId, amount)
      latestLevels.current = outcome.levels
      setLevels(outcome.levels)
      return outcome
    },
    [setLevels],
  )

  const restock = useCallback(
    (itemId: string, amount: number) => {
      const next = stock.applyRestock(latestLevels.current, itemId, amount)
      latestLevels.current = next
      setLevels(next)
    },
    [setLevels],
  )

  const enrol = useCallback(
    (inductionId: string, memberId: string): boolean => {
      const induction = INDUCTIONS_BY_ID.get(inductionId)
      if (!induction) return false

      const current = latestEnrolments.current
      if (inductions.isEnrolled(inductionId, memberId, current)) return false
      if (inductions.isFull(induction, current)) return false

      const next = [...current, { inductionId, memberId }]
      latestEnrolments.current = next
      setEnrolments(next)
      return true
    },
    [setEnrolments],
  )

  const withdraw = useCallback(
    (inductionId: string, memberId: string): boolean => {
      const current = latestEnrolments.current
      if (!inductions.isEnrolled(inductionId, memberId, current)) return false

      const next = current.filter(
        (enrolment) =>
          enrolment.inductionId !== inductionId || enrolment.memberId !== memberId,
      )
      latestEnrolments.current = next
      setEnrolments(next)
      return true
    },
    [setEnrolments],
  )

  const quantityOf = useCallback((itemId: string) => stock.quantityOf(levels, itemId), [levels])

  const isLow = useCallback(
    (itemId: string) => {
      const item = CONSUMABLES_BY_ID.get(itemId)
      return item ? stock.isLow(item, levels) : false
    },
    [levels],
  )

  const lowStock = useMemo(() => stock.lowStockItems(levels), [levels])

  const seatsTakenFor = useCallback(
    (inductionId: string) => inductions.seatsTaken(inductionId, enrolments),
    [enrolments],
  )

  const isEnrolled = useCallback(
    (inductionId: string, memberId: string) =>
      inductions.isEnrolled(inductionId, memberId, enrolments),
    [enrolments],
  )

  const enrolmentsForMember = useCallback(
    (memberId: string) => inductions.enrolmentsForMember(memberId, enrolments),
    [enrolments],
  )

  const value = useMemo(
    () => ({
      levels,
      enrolments,
      draw,
      restock,
      enrol,
      withdraw,
      quantityOf,
      isLow,
      lowStock,
      seatsTakenFor,
      isEnrolled,
      enrolmentsForMember,
    }),
    [
      levels,
      enrolments,
      draw,
      restock,
      enrol,
      withdraw,
      quantityOf,
      isLow,
      lowStock,
      seatsTakenFor,
      isEnrolled,
      enrolmentsForMember,
    ],
  )

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>
}
