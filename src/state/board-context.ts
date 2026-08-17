import { createContext, useContext } from 'react'

import type { Booking, BookingDraft, Rejection } from '@/types'

export interface CreateResult {
  ok: boolean
  booking?: Booking
  rejections?: readonly Rejection[]
}

export interface BoardContextValue {
  bookings: readonly Booking[]
  /** Ids currently being written; the UI dims these rather than hiding them. */
  pendingIds: ReadonlySet<string>
  createBooking: (draft: BookingDraft) => Promise<CreateResult>
  cancelBooking: (bookingId: string) => Promise<boolean>
  bookingsForMachine: (machineId: string) => readonly Booking[]
  bookingsForMember: (memberId: string) => readonly Booking[]
}

export const BoardContext = createContext<BoardContextValue | null>(null)

export function useBoard(): BoardContextValue {
  const context = useContext(BoardContext)
  if (!context) {
    throw new Error('useBoard must be used inside a <BoardProvider>')
  }
  return context
}
