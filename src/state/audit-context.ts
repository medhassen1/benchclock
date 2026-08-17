import { createContext, useContext } from 'react'

import type { AuditEntry, AuditFilter } from '@/lib/audit'

/** Everything an entry needs except the parts the provider issues. */
export interface AuditInput {
  actorId: string
  action: AuditEntry['action']
  subject: string
  details?: string
  /** Overridable so a test can pin the timestamp instead of the wall clock. */
  at?: number
}

export interface AuditContextValue {
  /** The whole trail, oldest first, exactly as it is stored. */
  entries: readonly AuditEntry[]
  record: (input: AuditInput) => AuditEntry
  /** Filtered and sorted newest first; omit the filter for everything. */
  query: (filter?: AuditFilter) => readonly AuditEntry[]
  clear: () => void
}

export const AuditContext = createContext<AuditContextValue | null>(null)

export function useAudit(): AuditContextValue {
  const context = useContext(AuditContext)
  if (!context) {
    throw new Error('useAudit must be used inside an <AuditProvider>')
  }
  return context
}

/**
 * The trail is an optional extra rather than part of the board, so a page that
 * merely wants to log something keeps working when it is rendered outside the
 * provider. Callers record through `audit?.record(…)`.
 */
export function useOptionalAudit(): AuditContextValue | null {
  return useContext(AuditContext)
}
