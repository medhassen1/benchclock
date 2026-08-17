import { createContext, useContext } from 'react'

import type { Member } from '@/types'

export interface SessionContextValue {
  /** Whoever is signed in at the workshop terminal. */
  member: Member
  setMemberId: (memberId: string) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used inside a <SessionProvider>')
  }
  return context
}
