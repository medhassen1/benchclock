import { createContext, useContext } from 'react'

import type {
  ConfigError,
  DayDraft,
  MachineDraft,
  MemberDraft,
  WorkshopOverrides,
} from '@/lib/workshopConfig'
import type { DayWindow, Machine, Member } from '@/types'

export interface WorkshopConfigContextValue {
  /** The stored patch. Empty means the workshop runs on the shipped fixtures. */
  overrides: WorkshopOverrides
  machines: readonly Machine[]
  members: readonly Member[]
  hours: readonly DayWindow[]
  machineById: ReadonlyMap<string, Machine>
  /** True when anything has been edited away from the defaults. */
  customised: boolean
  /** Each update returns the reasons it was refused; empty means it was saved. */
  updateMachine: (machineId: string, draft: MachineDraft) => readonly ConfigError[]
  updateMember: (memberId: string, draft: MemberDraft) => readonly ConfigError[]
  /**
   * Opening hours are saved a whole week at a time: the days are validated
   * together and either all land or none do, so the board is never left with
   * half a week applied.
   */
  updateDays: (drafts: readonly DayDraft[]) => readonly ConfigError[]
  resetMachine: (machineId: string) => void
  resetHours: () => void
  resetAll: () => void
}

export const WorkshopConfigContext = createContext<WorkshopConfigContextValue | null>(null)

export function useWorkshopConfig(): WorkshopConfigContextValue {
  const context = useContext(WorkshopConfigContext)
  if (!context) {
    throw new Error('useWorkshopConfig must be used inside a <WorkshopConfigProvider>')
  }
  return context
}
