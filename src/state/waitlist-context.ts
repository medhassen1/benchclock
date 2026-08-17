import { createContext, useContext } from 'react'

import type {
  JoinResult,
  PromotionOutcome,
  WaitlistEntry,
  WaitlistJoinInput,
  WaitlistSlot,
} from '@/lib/waitlist'
import type { Booking } from '@/types'

export interface PromotionResult extends PromotionOutcome {
  /** The booking the promoted member now holds, when the write succeeded. */
  booking?: Booking
}

export interface WaitlistContextValue {
  entries: readonly WaitlistEntry[]
  /** Adds the member to the back of a slot's queue, refusing a second place. */
  join: (input: WaitlistJoinInput) => JoinResult
  /** Gives up a place; true when an entry was actually removed. */
  leave: (entryId: string) => boolean
  /**
   * Hands a freed slot to the first member who still qualifies, booking it for
   * them. Everyone passed over is returned with the rules' reasons.
   */
  promote: (slot: WaitlistSlot) => Promise<PromotionResult>
  entriesForSlot: (slot: WaitlistSlot) => readonly WaitlistEntry[]
  entriesForMember: (memberId: string) => readonly WaitlistEntry[]
  /** 1-based place in the entry's own queue; 0 when it is not queued. */
  positionOf: (entryId: string) => number
}

export const WaitlistContext = createContext<WaitlistContextValue | null>(null)

export function useWaitlist(): WaitlistContextValue {
  const context = useContext(WaitlistContext)
  if (!context) {
    throw new Error('useWaitlist must be used inside a <WaitlistProvider>')
  }
  return context
}
