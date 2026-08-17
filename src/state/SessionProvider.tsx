import { useCallback, useMemo, type ReactNode } from 'react'

import { MEMBERS, MEMBERS_BY_ID } from '@/data/workshop'
import { usePersistentState } from '@/hooks/usePersistentState'
import { STORAGE_KEYS } from '@/lib/storage'

import { SessionContext } from './session-context'

function parseMemberId(raw: unknown): string | null {
  return typeof raw === 'string' && MEMBERS_BY_ID.has(raw) ? raw : null
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = usePersistentState<string>(
    STORAGE_KEYS.member,
    MEMBERS[0].id,
    parseMemberId,
  )

  // A member removed from the roster between visits falls back to the first.
  const member = MEMBERS_BY_ID.get(memberId) ?? MEMBERS[0]

  const select = useCallback((next: string) => setMemberId(next), [setMemberId])

  const value = useMemo(() => ({ member, setMemberId: select }), [member, select])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
