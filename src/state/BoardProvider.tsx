import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import { usePersistentState } from '@/hooks/usePersistentState'
import * as api from '@/lib/api'
import { STORAGE_KEYS } from '@/lib/storage'
import type { Booking, BookingDraft } from '@/types'

import { BoardContext, type CreateResult } from './board-context'

function isBooking(raw: unknown): raw is Booking {
  if (typeof raw !== 'object' || raw === null) return false
  const v = raw as Record<string, unknown>

  return (
    typeof v.id === 'string' &&
    typeof v.machineId === 'string' &&
    typeof v.memberId === 'string' &&
    typeof v.startMinute === 'number' &&
    typeof v.endMinute === 'number' &&
    typeof v.note === 'string' &&
    typeof v.createdAt === 'number'
  )
}

function parseBookings(raw: unknown): Booking[] | null {
  return Array.isArray(raw) && raw.every(isBooking) ? raw : null
}

/**
 * Holds every booking on the board and performs writes optimistically: the
 * change lands immediately, and is rolled back if the server refuses it. The
 * temporary row stays visible but marked pending, so the grid never jumps.
 */
export function BoardProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = usePersistentState<Booking[]>(
    STORAGE_KEYS.bookings,
    [],
    parseBookings,
  )
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())

  // Reads the freshest board inside async callbacks without making them
  // depend on `bookings`, which would re-create them on every write.
  const latest = useRef(bookings)
  latest.current = bookings

  const markPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const tempCounter = useRef(0)

  const createBooking = useCallback(
    async (draft: BookingDraft): Promise<CreateResult> => {
      tempCounter.current += 1
      const tempId = `pending-${tempCounter.current}`
      const optimistic: Booking = { ...draft, id: tempId, createdAt: Date.now() }
      const board = latest.current

      setBookings((current) => [...current, optimistic])
      markPending(tempId, true)

      try {
        const saved = await api.createBooking(draft, board)
        setBookings((current) =>
          current.map((booking) => (booking.id === tempId ? saved : booking)),
        )
        return { ok: true, booking: saved }
      } catch (error) {
        setBookings((current) => current.filter((booking) => booking.id !== tempId))

        if (error instanceof api.BookingRejectedError) {
          return { ok: false, rejections: error.rejections }
        }
        return {
          ok: false,
          rejections: [
            { code: 'overlaps-booking', message: 'The board could not be updated. Try again.' },
          ],
        }
      } finally {
        markPending(tempId, false)
      }
    },
    [setBookings, markPending],
  )

  const updateBooking = useCallback(
    async (bookingId: string, draft: BookingDraft): Promise<CreateResult> => {
      const board = latest.current
      const previous = board.find((booking) => booking.id === bookingId)
      if (!previous) return { ok: false }

      markPending(bookingId, true)
      // Show the new time straight away, keeping the same id and row.
      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? { ...booking, ...draft } : booking)),
      )

      try {
        const saved = await api.updateBooking(bookingId, draft, board)
        setBookings((current) =>
          current.map((booking) => (booking.id === bookingId ? saved : booking)),
        )
        return { ok: true, booking: saved }
      } catch (error) {
        // Put the original times back rather than stranding it at the new one.
        setBookings((current) =>
          current.map((booking) => (booking.id === bookingId ? previous : booking)),
        )

        if (error instanceof api.BookingRejectedError) {
          return { ok: false, rejections: error.rejections }
        }
        return {
          ok: false,
          rejections: [
            { code: 'overlaps-booking', message: 'The board could not be updated. Try again.' },
          ],
        }
      } finally {
        markPending(bookingId, false)
      }
    },
    [setBookings, markPending],
  )

  const cancelBooking = useCallback(
    async (bookingId: string): Promise<boolean> => {
      const board = latest.current
      const removed = board.find((booking) => booking.id === bookingId)
      if (!removed) return false

      markPending(bookingId, true)
      setBookings((current) => current.filter((booking) => booking.id !== bookingId))

      try {
        await api.cancelBooking(bookingId, board)
        return true
      } catch {
        // Put it back where it was rather than losing the reservation.
        setBookings((current) =>
          current.some((booking) => booking.id === bookingId) ? current : [...current, removed],
        )
        return false
      } finally {
        markPending(bookingId, false)
      }
    },
    [setBookings, markPending],
  )

  const byMachine = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const booking of bookings) {
      const list = map.get(booking.machineId)
      if (list) list.push(booking)
      else map.set(booking.machineId, [booking])
    }
    return map
  }, [bookings])

  const bookingsForMachine = useCallback(
    (machineId: string) => byMachine.get(machineId) ?? [],
    [byMachine],
  )

  const bookingsForMember = useCallback(
    (memberId: string) =>
      bookings
        .filter((booking) => booking.memberId === memberId)
        .sort((a, b) => a.startMinute - b.startMinute),
    [bookings],
  )

  const value = useMemo(
    () => ({
      bookings,
      pendingIds,
      createBooking,
      updateBooking,
      cancelBooking,
      bookingsForMachine,
      bookingsForMember,
    }),
    [
      bookings,
      pendingIds,
      createBooking,
      updateBooking,
      cancelBooking,
      bookingsForMachine,
      bookingsForMember,
    ],
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}
