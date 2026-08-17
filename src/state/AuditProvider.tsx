import { useCallback, useMemo, useRef, type ReactNode } from 'react'

import { usePersistentState } from '@/hooks/usePersistentState'
import {
  AUDIT_STORAGE_KEY,
  MAX_AUDIT_ENTRIES,
  appendAuditEntry,
  filterAuditEntries,
  formatAuditId,
  highestAuditSequence,
  isAuditEntry,
  type AuditEntry,
  type AuditFilter,
} from '@/lib/audit'

import { AuditContext, type AuditInput } from './audit-context'

/**
 * Anything unrecognised is dropped rather than failing the whole read: a trail
 * half-written by an older build is still worth showing, and losing one entry
 * matters far less than losing the log.
 */
function parseAuditEntries(raw: unknown): AuditEntry[] | null {
  if (!Array.isArray(raw)) return null

  const entries = raw.filter(isAuditEntry)
  return entries.length > MAX_AUDIT_ENTRIES
    ? entries.slice(entries.length - MAX_AUDIT_ENTRIES)
    : entries
}

export interface AuditProviderProps {
  children: ReactNode
  /** Lowered in tests to exercise trimming without recording hundreds of entries. */
  limit?: number
}

export function AuditProvider({ children, limit = MAX_AUDIT_ENTRIES }: AuditProviderProps) {
  const [entries, setEntries] = usePersistentState<AuditEntry[]>(
    AUDIT_STORAGE_KEY,
    [],
    parseAuditEntries,
  )

  // Seeded from what was restored, so ids stay unique across a reload rather
  // than restarting at one and colliding with the entries already stored.
  const sequence = useRef<number | null>(null)
  if (sequence.current === null) sequence.current = highestAuditSequence(entries)

  const record = useCallback(
    (input: AuditInput): AuditEntry => {
      const next = (sequence.current ?? 0) + 1
      sequence.current = next

      const entry: AuditEntry = {
        id: formatAuditId(next),
        actorId: input.actorId,
        action: input.action,
        subject: input.subject,
        details: input.details ?? '',
        at: input.at ?? Date.now(),
      }

      setEntries((current) => appendAuditEntry(current, entry, limit))
      return entry
    },
    [setEntries, limit],
  )

  const query = useCallback(
    (filter: AuditFilter = {}) => filterAuditEntries(entries, filter),
    [entries],
  )

  const clear = useCallback(() => setEntries([]), [setEntries])

  const value = useMemo(
    () => ({ entries, record, query, clear }),
    [entries, record, query, clear],
  )

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>
}
