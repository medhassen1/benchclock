import { useCallback, useMemo, useRef, type ReactNode } from 'react'

import {
  MAINTENANCE_KIND_LABELS,
  MAINTENANCE_WINDOWS,
  type MaintenanceKind,
  type MaintenanceWindow,
  type MaintenanceWindowDraft,
  type ServiceLogEntry,
  type ServiceRecordDraft,
} from '@/data/maintenance'
import { MACHINES_BY_ID, MINUTES_PER_WEEK } from '@/data/workshop'
import { usePersistentState } from '@/hooks/usePersistentState'
import {
  nextId,
  nextWindowFor as findNextWindow,
  sortServiceLog,
  windowsForMachine as findWindowsForMachine,
} from '@/lib/maintenance'
import type { Member } from '@/types'

import {
  MAINTENANCE_STORAGE_KEYS,
  MaintenanceContext,
  type ServiceResult,
} from './maintenance-context'

const KINDS = Object.keys(MAINTENANCE_KIND_LABELS) as MaintenanceKind[]

function isKind(raw: unknown): raw is MaintenanceKind {
  return typeof raw === 'string' && KINDS.includes(raw as MaintenanceKind)
}

/** A minute that could plausibly sit on this week's board. */
function isWeekMinute(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= MINUTES_PER_WEEK
}

function isWindow(raw: unknown): raw is MaintenanceWindow {
  if (typeof raw !== 'object' || raw === null) return false
  const v = raw as Record<string, unknown>

  return (
    typeof v.id === 'string' &&
    typeof v.machineId === 'string' &&
    isWeekMinute(v.startMinute) &&
    isWeekMinute(v.endMinute) &&
    (v.endMinute as number) > (v.startMinute as number) &&
    isKind(v.kind) &&
    typeof v.reason === 'string'
  )
}

function isServiceEntry(raw: unknown): raw is ServiceLogEntry {
  if (typeof raw !== 'object' || raw === null) return false
  const v = raw as Record<string, unknown>

  return (
    typeof v.id === 'string' &&
    typeof v.machineId === 'string' &&
    typeof v.memberId === 'string' &&
    isKind(v.kind) &&
    typeof v.notes === 'string' &&
    isWeekMinute(v.minute) &&
    typeof v.runMinutesAtService === 'number' &&
    typeof v.recordedAt === 'number'
  )
}

function parseWindows(raw: unknown): MaintenanceWindow[] | null {
  return Array.isArray(raw) && raw.every(isWindow) ? raw : null
}

function parseServiceLog(raw: unknown): ServiceLogEntry[] | null {
  return Array.isArray(raw) && raw.every(isServiceEntry) ? raw : null
}

// A copy, because the persisted list is edited in place of the fixture once a
// keyholder adds or removes a window.
const INITIAL_WINDOWS: MaintenanceWindow[] = [...MAINTENANCE_WINDOWS]

/**
 * Holds the week's maintenance windows and the log of completed services.
 *
 * Both survive a reload through `localStorage`, and both are validated on the
 * way in: data written by an older build falls back to the shipped schedule
 * rather than putting half-formed windows on the board.
 */
export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = usePersistentState<MaintenanceWindow[]>(
    MAINTENANCE_STORAGE_KEYS.windows,
    INITIAL_WINDOWS,
    parseWindows,
  )
  const [serviceLog, setServiceLog] = usePersistentState<ServiceLogEntry[]>(
    MAINTENANCE_STORAGE_KEYS.serviceLog,
    [],
    parseServiceLog,
  )

  // Read inside callbacks so they do not have to depend on the lists, which
  // would re-create every handler after each write.
  const latestWindows = useRef(windows)
  latestWindows.current = windows
  const latestLog = useRef(serviceLog)
  latestLog.current = serviceLog

  const addWindow = useCallback(
    (draft: MaintenanceWindowDraft): MaintenanceWindow => {
      const window: MaintenanceWindow = { ...draft, id: nextId('mw', latestWindows.current) }
      setWindows((current) => [...current, window])
      return window
    },
    [setWindows],
  )

  const removeWindow = useCallback(
    (windowId: string): boolean => {
      if (!latestWindows.current.some((window) => window.id === windowId)) return false
      setWindows((current) => current.filter((window) => window.id !== windowId))
      return true
    },
    [setWindows],
  )

  const completeService = useCallback(
    (draft: ServiceRecordDraft, member: Member): ServiceResult => {
      if (member.tier !== 'keyholder') {
        return { ok: false, reason: 'Only keyholders can record a service.' }
      }
      if (!MACHINES_BY_ID.has(draft.machineId)) {
        return { ok: false, reason: 'That machine is not in the workshop.' }
      }
      if (draft.notes.trim() === '') {
        return { ok: false, reason: 'Say what was done before signing the service off.' }
      }

      const entry: ServiceLogEntry = {
        ...draft,
        notes: draft.notes.trim(),
        id: nextId('svc', latestLog.current),
        memberId: member.id,
        recordedAt: Date.now(),
      }

      setServiceLog((current) => [...current, entry])
      return { ok: true, entry }
    },
    [setServiceLog],
  )

  const windowsForMachine = useCallback(
    (machineId: string) => findWindowsForMachine(machineId, windows),
    [windows],
  )

  const nextWindowFor = useCallback(
    (machineId: string, fromMinute: number) => findNextWindow(machineId, fromMinute, windows),
    [windows],
  )

  // Newest first: the log is read to find out what happened most recently.
  const ordered = useMemo(() => sortServiceLog(serviceLog), [serviceLog])

  const serviceLogForMachine = useCallback(
    (machineId: string) => ordered.filter((entry) => entry.machineId === machineId),
    [ordered],
  )

  const value = useMemo(
    () => ({
      windows,
      serviceLog: ordered,
      addWindow,
      removeWindow,
      completeService,
      windowsForMachine,
      nextWindowFor,
      serviceLogForMachine,
    }),
    [
      windows,
      ordered,
      addWindow,
      removeWindow,
      completeService,
      windowsForMachine,
      nextWindowFor,
      serviceLogForMachine,
    ],
  )

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>
}
