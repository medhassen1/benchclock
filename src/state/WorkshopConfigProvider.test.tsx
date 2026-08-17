import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { MACHINES, MEMBERS, OPENING_HOURS } from '@/data/workshop'
import {
  CONFIG_STORAGE_KEY,
  dayDraftsFrom,
  machineDraftFrom,
  memberDraftFrom,
  type DayDraft,
  type MachineDraft,
} from '@/lib/workshopConfig'
import { WorkshopConfigProvider } from '@/state/WorkshopConfigProvider'
import { useWorkshopConfig } from '@/state/workshop-config-context'

const wrapper = ({ children }: { children: ReactNode }) => (
  <WorkshopConfigProvider>{children}</WorkshopConfigProvider>
)

const renderConfig = () => renderHook(() => useWorkshopConfig(), { wrapper })

const laser = MACHINES[0]

const machineDraft = (over: Partial<MachineDraft> = {}): MachineDraft => ({
  ...machineDraftFrom(laser),
  ...over,
})

/** The whole week's drafts with some days changed, as the editor submits it. */
function week(changes: Readonly<Record<number, Partial<DayDraft>>>): DayDraft[] {
  return dayDraftsFrom({ machines: {}, members: {}, days: {} }).map((draft) => ({
    ...draft,
    ...changes[draft.day],
  }))
}

function seedConfig(value: unknown) {
  window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(value))
}

describe('WorkshopConfigProvider', () => {
  it('starts on the shipped fixtures', () => {
    const { result } = renderConfig()

    expect(result.current.machines).toEqual([...MACHINES])
    expect(result.current.members).toEqual([...MEMBERS])
    expect(result.current.hours).toEqual([...OPENING_HOURS])
    expect(result.current.customised).toBe(false)
  })

  it('indexes the effective machines by id', () => {
    const { result } = renderConfig()

    expect(result.current.machineById.get('laser-a')?.name).toBe('Big laser')
    expect(result.current.machineById.size).toBe(MACHINES.length)
  })

  it('applies a machine edit and marks the workshop customised', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateMachine(
        'laser-a',
        machineDraft({ name: 'Huge laser', cooldownMinutes: 0 }),
      )
    })

    expect(result.current.machineById.get('laser-a')).toMatchObject({
      name: 'Huge laser',
      cooldownMinutes: 0,
    })
    expect(result.current.customised).toBe(true)
  })

  it('refuses an invalid machine edit and changes nothing', () => {
    const { result } = renderConfig()

    let errors: readonly { code: string }[] = []
    act(() => {
      errors = result.current.updateMachine('laser-a', machineDraft({ maxSessionMinutes: 0 }))
    })

    expect(errors.map((error) => error.code)).toEqual(['session-not-positive'])
    expect(result.current.machineById.get('laser-a')?.maxSessionMinutes).toBe(
      laser.maxSessionMinutes,
    )
    expect(result.current.customised).toBe(false)
  })

  it('refuses a negative cool-down', () => {
    const { result } = renderConfig()

    let errors: readonly { code: string }[] = []
    act(() => {
      errors = result.current.updateMachine('laser-a', machineDraft({ cooldownMinutes: -30 }))
    })

    expect(errors.map((error) => error.code)).toEqual(['cooldown-negative'])
  })

  it('applies a member edit', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateMember('m-pia', {
        ...memberDraftFrom(MEMBERS[3]),
        weeklyMinuteAllowance: 600,
      })
    })

    expect(result.current.members[3].weeklyMinuteAllowance).toBe(600)
  })

  it('refuses a negative allowance', () => {
    const { result } = renderConfig()

    let errors: readonly { code: string }[] = []
    act(() => {
      errors = result.current.updateMember('m-pia', {
        ...memberDraftFrom(MEMBERS[3]),
        weeklyMinuteAllowance: -1,
      })
    })

    expect(errors.map((error) => error.code)).toEqual(['allowance-negative'])
    expect(result.current.members[3].weeklyMinuteAllowance).toBe(240)
  })

  it('saves a whole week of opening hours at once', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateDays(
        week({ 0: { openMinute: 8 * 60, closeMinute: 12 * 60 }, 1: { closed: true } }),
      )
    })

    expect(result.current.hours[0]).toEqual({ day: 0, openMinute: 480, closeMinute: 720 })
    expect(result.current.hours.some((window) => window.day === 1)).toBe(false)
  })

  it('refuses a week where any day closes before it opens, leaving all days alone', () => {
    const { result } = renderConfig()

    let errors: readonly { code: string; day?: number }[] = []
    act(() => {
      errors = result.current.updateDays(week({ 3: { openMinute: 20 * 60, closeMinute: 9 * 60 } }))
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ code: 'window-order', day: 3 })
    expect(result.current.hours).toEqual([...OPENING_HOURS])
  })

  it('closes a day and re-opens it with the times it remembered', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateDays(week({ 5: { closed: true, openMinute: 8 * 60 } }))
    })
    expect(result.current.hours.some((window) => window.day === 5)).toBe(false)

    const remembered = result.current.overrides.days['5']
    expect(remembered).toMatchObject({ closed: true, openMinute: 480 })
  })

  it('resets one machine back to its shipped values', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateMachine('laser-a', machineDraft({ outOfService: true }))
    })
    act(() => {
      result.current.resetMachine('laser-a')
    })

    expect(result.current.machineById.get('laser-a')).toEqual(laser)
    expect(result.current.customised).toBe(false)
  })

  it('resets the opening hours without touching machine edits', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateMachine('laser-a', machineDraft({ name: 'Huge laser' }))
    })
    act(() => {
      result.current.updateDays(week({ 0: { closed: true } }))
    })
    act(() => {
      result.current.resetHours()
    })

    expect(result.current.hours).toEqual([...OPENING_HOURS])
    expect(result.current.machineById.get('laser-a')?.name).toBe('Huge laser')
  })

  it('resets everything back to the defaults', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateMachine('laser-a', machineDraft({ name: 'Huge laser' }))
    })
    act(() => {
      result.current.updateDays(week({ 0: { closed: true } }))
    })
    act(() => {
      result.current.resetAll()
    })

    expect(result.current.machines).toEqual([...MACHINES])
    expect(result.current.hours).toEqual([...OPENING_HOURS])
    expect(result.current.customised).toBe(false)
  })

  it('persists overrides across a remount', async () => {
    const first = renderConfig()
    act(() => {
      first.result.current.updateMachine('laser-a', machineDraft({ location: 'Yard' }))
    })
    first.unmount()

    const second = renderConfig()

    await waitFor(() =>
      expect(second.result.current.machineById.get('laser-a')?.location).toBe('Yard'),
    )
  })

  it('stores only the fields that differ from the fixtures', () => {
    const { result } = renderConfig()

    act(() => {
      result.current.updateMachine('laser-a', machineDraft({ location: 'Yard' }))
    })

    expect(result.current.overrides.machines).toEqual({ 'laser-a': { location: 'Yard' } })
  })

  it('reads a well-formed persisted patch', async () => {
    seedConfig({
      machines: { 'laser-a': { maxSessionMinutes: 60 } },
      members: {},
      days: { '0': { closed: true, openMinute: 1020, closeMinute: 1320 } },
    })

    const { result } = renderConfig()

    await waitFor(() =>
      expect(result.current.machineById.get('laser-a')?.maxSessionMinutes).toBe(60),
    )
    expect(result.current.hours.some((window) => window.day === 0)).toBe(false)
  })

  it('discards a persisted patch that is not an object', () => {
    seedConfig('nonsense')

    expect(renderConfig().result.current.machines).toEqual([...MACHINES])
  })

  it('discards a persisted patch missing its sections', () => {
    seedConfig({ machines: {} })

    expect(renderConfig().result.current.customised).toBe(false)
  })

  it('discards a persisted patch with a mistyped field', () => {
    seedConfig({ machines: { 'laser-a': { maxSessionMinutes: '60' } }, members: {}, days: {} })

    expect(renderConfig().result.current.machineById.get('laser-a')).toEqual(laser)
  })

  it('discards a persisted patch with an unknown sign-off', () => {
    seedConfig({ machines: {}, members: { 'm-pia': { tickets: ['woodwork'] } }, days: {} })

    expect(renderConfig().result.current.members).toEqual([...MEMBERS])
  })

  it('discards a persisted patch with an impossible day key', () => {
    seedConfig({
      machines: {},
      members: {},
      days: { '9': { closed: true, openMinute: 0, closeMinute: 60 } },
    })

    expect(renderConfig().result.current.hours).toEqual([...OPENING_HOURS])
  })

  it('discards a hand-edited patch whose values break the booking rules', () => {
    seedConfig({ machines: { 'laser-a': { cooldownMinutes: -60 } }, members: {}, days: {} })

    expect(renderConfig().result.current.machineById.get('laser-a')).toEqual(laser)
  })

  it('discards a hand-edited window that closes before it opens', () => {
    seedConfig({
      machines: {},
      members: {},
      days: { '0': { closed: false, openMinute: 1200, closeMinute: 600 } },
    })

    expect(renderConfig().result.current.hours).toEqual([...OPENING_HOURS])
  })

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useWorkshopConfig())).toThrow(
      /useWorkshopConfig must be used inside a <WorkshopConfigProvider>/,
    )
  })
})
