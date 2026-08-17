import { useCallback, useMemo, useRef, type ReactNode } from 'react'

import { usePersistentState } from '@/hooks/usePersistentState'
import * as waitlist from '@/lib/waitlist'
import type { SkippedEntry, WaitlistEntry, WaitlistJoinInput, WaitlistSlot } from '@/lib/waitlist'
import { useBoard } from '@/state/board-context'

import { WaitlistContext, type PromotionResult } from './waitlist-context'

function isWaitlistEntry(raw: unknown): raw is WaitlistEntry {
  if (typeof raw !== 'object' || raw === null) return false
  const v = raw as Record<string, unknown>

  return (
    typeof v.id === 'string' &&
    typeof v.machineId === 'string' &&
    typeof v.memberId === 'string' &&
    typeof v.startMinute === 'number' &&
    typeof v.endMinute === 'number' &&
    typeof v.note === 'string' &&
    typeof v.joinedAt === 'number'
  )
}

function parseEntries(raw: unknown): WaitlistEntry[] | null {
  return Array.isArray(raw) && raw.every(isWaitlistEntry) ? raw : null
}

/**
 * Holds every waitlist queue, persisted so a member keeps their place between
 * visits. Promotion goes through the board, so a waiting member only ever
 * receives a booking that both the rules and the server accept.
 */
export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = usePersistentState<WaitlistEntry[]>(
    waitlist.WAITLIST_STORAGE_KEY,
    [],
    parseEntries,
  )
  const { bookings, createBooking } = useBoard()

  // Read inside callbacks without making them depend on the queue, which would
  // re-create them — and strand an in-flight promotion — on every join.
  const latest = useRef(entries)
  latest.current = entries

  const board = useRef(bookings)
  board.current = bookings

  const join = useCallback(
    (input: WaitlistJoinInput) => {
      const result = waitlist.joinWaitlist(latest.current, input)
      if (result.ok) setEntries(result.entries)
      return result
    },
    [setEntries],
  )

  const leave = useCallback(
    (entryId: string) => {
      if (!latest.current.some((entry) => entry.id === entryId)) return false

      setEntries((current) => waitlist.leaveWaitlist(current, entryId))
      return true
    },
    [setEntries],
  )

  const promote = useCallback(
    async (slot: WaitlistSlot): Promise<PromotionResult> => {
      const skipped: SkippedEntry[] = []
      let remaining = latest.current

      const settle = (promoted: WaitlistEntry | null) => {
        const touched = skipped.map((skip) => skip.entry.id)
        if (promoted) touched.push(promoted.id)
        // Functional update, so places taken while the write was in flight are
        // kept rather than overwritten by a stale snapshot of the queue.
        setEntries((current) => waitlist.withoutEntries(current, touched))
      }

      // Each pass removes at least one entry, so the walk always terminates. A
      // member the local rules accept can still be refused by the server — a
      // clash somebody else wrote first — and is passed over just the same.
      for (;;) {
        const outcome = waitlist.resolvePromotion(remaining, slot, { bookings: board.current })
        skipped.push(...outcome.skipped)
        remaining = waitlist.withoutEntries(
          remaining,
          outcome.skipped.map((skip) => skip.entry.id),
        )

        if (!outcome.promoted) {
          settle(null)
          return { promoted: null, skipped }
        }

        remaining = waitlist.leaveWaitlist(remaining, outcome.promoted.id)
        const result = await createBooking(waitlist.draftFor(outcome.promoted))

        if (result.ok) {
          settle(outcome.promoted)
          return { promoted: outcome.promoted, skipped, booking: result.booking }
        }

        skipped.push({ entry: outcome.promoted, rejections: result.rejections ?? [] })
      }
    },
    [createBooking, setEntries],
  )

  const entriesForSlot = useCallback(
    (slot: WaitlistSlot) => waitlist.entriesForSlot(entries, slot),
    [entries],
  )

  const entriesForMember = useCallback(
    (memberId: string) => waitlist.entriesForMember(entries, memberId),
    [entries],
  )

  const positionOf = useCallback(
    (entryId: string) => waitlist.positionOf(entries, entryId),
    [entries],
  )

  const value = useMemo(
    () => ({ entries, join, leave, promote, entriesForSlot, entriesForMember, positionOf }),
    [entries, join, leave, promote, entriesForSlot, entriesForMember, positionOf],
  )

  return <WaitlistContext.Provider value={value}>{children}</WaitlistContext.Provider>
}
