import { useCallback, useMemo, useRef, type ReactNode } from 'react'

import { DAY_NAMES, TICKET_LABELS } from '@/data/workshop'
import { usePersistentState } from '@/hooks/usePersistentState'
import {
  applyOverrides,
  clearDayOverrides,
  clearMachineOverride,
  CONFIG_STORAGE_KEY,
  EMPTY_OVERRIDES,
  hasOverrides,
  machineDraftFrom,
  memberDraftFrom,
  setDayOverride,
  setMachineOverride,
  setMemberOverride,
  validateDayDraft,
  validateMachineDraft,
  validateMemberDraft,
  type ConfigError,
  type DayDraft,
  type DayOverride,
  type MachineDraft,
  type MachineOverride,
  type MemberDraft,
  type MemberOverride,
  type WorkshopOverrides,
} from '@/lib/workshopConfig'
import type { MembershipTier, Ticket } from '@/types'

import { WorkshopConfigContext } from './workshop-config-context'

const TIERS: readonly MembershipTier[] = ['casual', 'regular', 'keyholder']

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function isTicket(raw: unknown): raw is Ticket {
  return typeof raw === 'string' && raw in TICKET_LABELS
}

function isTier(raw: unknown): raw is MembershipTier {
  return typeof raw === 'string' && TIERS.includes(raw as MembershipTier)
}

function parseMachineOverride(raw: unknown): MachineOverride | null {
  if (!isRecord(raw)) return null
  const override: MachineOverride = {}

  if ('name' in raw) {
    if (typeof raw.name !== 'string') return null
    override.name = raw.name
  }
  if ('requiredTicket' in raw) {
    if (raw.requiredTicket !== null && !isTicket(raw.requiredTicket)) return null
    override.requiredTicket = raw.requiredTicket
  }
  if ('maxSessionMinutes' in raw) {
    if (typeof raw.maxSessionMinutes !== 'number') return null
    override.maxSessionMinutes = raw.maxSessionMinutes
  }
  if ('cooldownMinutes' in raw) {
    if (typeof raw.cooldownMinutes !== 'number') return null
    override.cooldownMinutes = raw.cooldownMinutes
  }
  if ('location' in raw) {
    if (typeof raw.location !== 'string') return null
    override.location = raw.location
  }
  if ('outOfService' in raw) {
    if (typeof raw.outOfService !== 'boolean') return null
    override.outOfService = raw.outOfService
  }

  return override
}

function parseMemberOverride(raw: unknown): MemberOverride | null {
  if (!isRecord(raw)) return null
  const override: MemberOverride = {}

  if ('name' in raw) {
    if (typeof raw.name !== 'string') return null
    override.name = raw.name
  }
  if ('tier' in raw) {
    if (!isTier(raw.tier)) return null
    override.tier = raw.tier
  }
  if ('tickets' in raw) {
    if (!Array.isArray(raw.tickets)) return null
    const tickets: unknown[] = raw.tickets
    if (!tickets.every(isTicket)) return null
    override.tickets = tickets
  }
  if ('weeklyMinuteAllowance' in raw) {
    if (typeof raw.weeklyMinuteAllowance !== 'number') return null
    override.weeklyMinuteAllowance = raw.weeklyMinuteAllowance
  }

  return override
}

function parseDayOverride(raw: unknown): DayOverride | null {
  if (!isRecord(raw)) return null
  if (
    typeof raw.closed !== 'boolean' ||
    typeof raw.openMinute !== 'number' ||
    typeof raw.closeMinute !== 'number'
  ) {
    return null
  }

  return { closed: raw.closed, openMinute: raw.openMinute, closeMinute: raw.closeMinute }
}

function parseSection<T>(
  raw: unknown,
  parseEntry: (entry: unknown) => T | null,
  isKeyAllowed: (key: string) => boolean,
): Record<string, T> | null {
  if (!isRecord(raw)) return null
  const section: Record<string, T> = {}

  for (const [key, entry] of Object.entries(raw)) {
    if (!isKeyAllowed(key)) return null
    const parsed = parseEntry(entry)
    if (parsed === null) return null
    section[key] = parsed
  }

  return section
}

/**
 * Reads a persisted patch, returning null for anything this build does not
 * recognise. Beyond the shape, the resulting workshop is re-validated: a
 * hand-edited store could hold a machine with a negative cool-down, and that
 * must never reach the booking rules.
 */
function parseOverrides(raw: unknown): WorkshopOverrides | null {
  if (!isRecord(raw)) return null

  const machines = parseSection(raw.machines, parseMachineOverride, () => true)
  const members = parseSection(raw.members, parseMemberOverride, () => true)
  const days = parseSection(raw.days, parseDayOverride, (key) => {
    const day = Number(key)
    return Number.isInteger(day) && day >= 0 && day < DAY_NAMES.length
  })

  if (!machines || !members || !days) return null

  const overrides: WorkshopOverrides = { machines, members, days }
  const effective = applyOverrides(overrides)

  const sane =
    effective.machines.every(
      (machine) => validateMachineDraft(machineDraftFrom(machine)).length === 0,
    ) &&
    effective.members.every((member) => validateMemberDraft(memberDraftFrom(member)).length === 0) &&
    effective.hours.every(
      (window) =>
        validateDayDraft({
          day: window.day,
          closed: false,
          openMinute: window.openMinute,
          closeMinute: window.closeMinute,
        }).length === 0,
    )

  return sane ? overrides : null
}

/**
 * Holds the workshop's administered settings. The shipped fixtures stay the
 * defaults and this provider only ever stores the difference, so the effective
 * machines, members, and opening hours are derived on every render.
 */
export function WorkshopConfigProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = usePersistentState<WorkshopOverrides>(
    CONFIG_STORAGE_KEY,
    EMPTY_OVERRIDES,
    parseOverrides,
  )

  // Edits are folded onto the freshest patch rather than the one captured at
  // render, so saving several days in one go cannot lose the earlier ones.
  const latest = useRef(overrides)
  latest.current = overrides

  const commit = useCallback(
    (next: WorkshopOverrides) => {
      latest.current = next
      setOverrides(next)
    },
    [setOverrides],
  )

  const updateMachine = useCallback(
    (machineId: string, draft: MachineDraft): readonly ConfigError[] => {
      const result = setMachineOverride(latest.current, machineId, draft)
      if (result.errors.length === 0) commit(result.overrides)
      return result.errors
    },
    [commit],
  )

  const updateMember = useCallback(
    (memberId: string, draft: MemberDraft): readonly ConfigError[] => {
      const result = setMemberOverride(latest.current, memberId, draft)
      if (result.errors.length === 0) commit(result.overrides)
      return result.errors
    },
    [commit],
  )

  const updateDays = useCallback(
    (drafts: readonly DayDraft[]): readonly ConfigError[] => {
      const errors = drafts.flatMap((draft) => validateDayDraft(draft))
      if (errors.length > 0) return errors

      let next = latest.current
      for (const draft of drafts) {
        next = setDayOverride(next, draft).overrides
      }

      commit(next)
      return []
    },
    [commit],
  )

  const resetMachine = useCallback(
    (machineId: string) => commit(clearMachineOverride(latest.current, machineId)),
    [commit],
  )

  const resetHours = useCallback(() => commit(clearDayOverrides(latest.current)), [commit])

  const resetAll = useCallback(() => commit(EMPTY_OVERRIDES), [commit])

  const effective = useMemo(() => applyOverrides(overrides), [overrides])

  const machineById = useMemo(
    () => new Map(effective.machines.map((machine) => [machine.id, machine])),
    [effective.machines],
  )

  const value = useMemo(
    () => ({
      overrides,
      machines: effective.machines,
      members: effective.members,
      hours: effective.hours,
      machineById,
      customised: hasOverrides(overrides),
      updateMachine,
      updateMember,
      updateDays,
      resetMachine,
      resetHours,
      resetAll,
    }),
    [
      overrides,
      effective,
      machineById,
      updateMachine,
      updateMember,
      updateDays,
      resetMachine,
      resetHours,
      resetAll,
    ],
  )

  return <WorkshopConfigContext.Provider value={value}>{children}</WorkshopConfigContext.Provider>
}
