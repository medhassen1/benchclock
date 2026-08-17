import { createContext, useContext } from 'react'

import type {
  MaintenanceWindow,
  MaintenanceWindowDraft,
  ServiceLogEntry,
  ServiceRecordDraft,
} from '@/data/maintenance'
import type { Member } from '@/types'

/**
 * Kept beside the board's own keys rather than in `STORAGE_KEYS`, so the
 * servicing feature owns its storage without the booking module knowing.
 */
export const MAINTENANCE_STORAGE_KEYS = {
  windows: 'benchclock:maintenance:v1',
  serviceLog: 'benchclock:servicelog:v1',
} as const

export interface ServiceResult {
  ok: boolean
  entry?: ServiceLogEntry
  /** Set when refused, phrased for whoever tried. */
  reason?: string
}

export interface MaintenanceContextValue {
  windows: readonly MaintenanceWindow[]
  /** Newest first, which is the order the log is read in. */
  serviceLog: readonly ServiceLogEntry[]
  addWindow: (draft: MaintenanceWindowDraft) => MaintenanceWindow
  removeWindow: (windowId: string) => boolean
  /**
   * Records a completed service. `member` is checked here rather than only in
   * the interface, so a stale page or a direct call cannot log work under a
   * tier that is not allowed to sign it off.
   */
  completeService: (draft: ServiceRecordDraft, member: Member) => ServiceResult
  windowsForMachine: (machineId: string) => readonly MaintenanceWindow[]
  nextWindowFor: (machineId: string, fromMinute: number) => MaintenanceWindow | undefined
  serviceLogForMachine: (machineId: string) => readonly ServiceLogEntry[]
}

export const MaintenanceContext = createContext<MaintenanceContextValue | null>(null)

export function useMaintenance(): MaintenanceContextValue {
  const context = useContext(MaintenanceContext)
  if (!context) {
    throw new Error('useMaintenance must be used inside a <MaintenanceProvider>')
  }
  return context
}
