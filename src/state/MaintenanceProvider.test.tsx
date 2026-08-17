import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { MAINTENANCE_WINDOWS, type ServiceRecordDraft } from '@/data/maintenance'
import { MEMBERS_BY_ID } from '@/data/workshop'
import { weekMinute } from '@/lib/weektime'
import { MaintenanceProvider } from '@/state/MaintenanceProvider'
import { useMaintenance } from '@/state/maintenance-context'
import type { Member } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const member = (id: string): Member => {
  const found = MEMBERS_BY_ID.get(id)
  if (!found) throw new Error(`no member ${id}`)
  return found
}

/** Ilra is a keyholder; Tomas is a regular and Pia a casual member. */
const ILRA = member('m-ilra')
const TOMAS = member('m-tomas')
const PIA = member('m-pia')

const wrapper = ({ children }: { children: ReactNode }) => (
  <MaintenanceProvider>{children}</MaintenanceProvider>
)

const renderMaintenance = () => renderHook(() => useMaintenance(), { wrapper })

const service = (over: Partial<ServiceRecordDraft> = {}): ServiceRecordDraft => ({
  machineId: 'laser-a',
  kind: 'service',
  notes: 'Aligned the mirrors',
  minute: at(1, 19),
  runMinutesAtService: 1200,
  ...over,
})

describe('MaintenanceProvider', () => {
  it('starts from the shipped schedule with an empty service log', () => {
    const { result } = renderMaintenance()

    expect(result.current.windows).toHaveLength(MAINTENANCE_WINDOWS.length)
    expect(result.current.serviceLog).toEqual([])
  })

  it('adds a window with a fresh id', () => {
    const { result } = renderMaintenance()

    let added: { id: string } | undefined
    act(() => {
      added = result.current.addWindow({
        machineId: 'printer-b',
        startMinute: at(4, 10),
        endMinute: at(4, 12),
        kind: 'inspection',
        reason: 'Belt tension check',
      })
    })

    expect(added?.id).toBe('mw-0008')
    expect(result.current.windowsForMachine('printer-b')).toHaveLength(1)
  })

  it('removes a window and reports the removal', () => {
    const { result } = renderMaintenance()

    let removed: boolean | undefined
    act(() => {
      removed = result.current.removeWindow('mw-0002')
    })

    expect(removed).toBe(true)
    expect(result.current.windows.some((window) => window.id === 'mw-0002')).toBe(false)
  })

  it('ignores a remove for a window that is not scheduled', () => {
    const { result } = renderMaintenance()

    let removed: boolean | undefined
    act(() => {
      removed = result.current.removeWindow('mw-9999')
    })

    expect(removed).toBe(false)
    expect(result.current.windows).toHaveLength(MAINTENANCE_WINDOWS.length)
  })

  it('lists a machine\'s windows earliest first, and none for an unscheduled machine', () => {
    const { result } = renderMaintenance()

    const laser = result.current.windowsForMachine('laser-a')
    expect(laser.map((window) => window.id)).toEqual(['mw-0002', 'mw-0006'])
    expect(result.current.windowsForMachine('laser-b')).toEqual([])
  })

  it('finds the next window from a given minute', () => {
    const { result } = renderMaintenance()

    expect(result.current.nextWindowFor('laser-a', 0)?.id).toBe('mw-0002')
    expect(result.current.nextWindowFor('laser-a', at(2, 0))?.id).toBe('mw-0006')
    expect(result.current.nextWindowFor('laser-b', 0)).toBeUndefined()
  })

  it('records a service for a keyholder', () => {
    const { result } = renderMaintenance()

    let outcome: ReturnType<typeof result.current.completeService> | undefined
    act(() => {
      outcome = result.current.completeService(service(), ILRA)
    })

    expect(outcome?.ok).toBe(true)
    expect(outcome?.entry).toMatchObject({
      id: 'svc-0001',
      machineId: 'laser-a',
      memberId: ILRA.id,
      notes: 'Aligned the mirrors',
      runMinutesAtService: 1200,
    })
    expect(result.current.serviceLog).toHaveLength(1)
  })

  it('refuses a service from a regular member', () => {
    const { result } = renderMaintenance()

    let outcome: ReturnType<typeof result.current.completeService> | undefined
    act(() => {
      outcome = result.current.completeService(service(), TOMAS)
    })

    expect(outcome?.ok).toBe(false)
    expect(outcome?.reason).toBe('Only keyholders can record a service.')
    expect(result.current.serviceLog).toEqual([])
  })

  it('refuses a service from a casual member', () => {
    const { result } = renderMaintenance()

    act(() => {
      result.current.completeService(service(), PIA)
    })

    expect(result.current.serviceLog).toEqual([])
  })

  it('signs the entry with the member who recorded it, not the draft', () => {
    const { result } = renderMaintenance()

    let outcome: ReturnType<typeof result.current.completeService> | undefined
    act(() => {
      // A draft carrying someone else's id cannot exist: the provider stamps
      // the signed-in keyholder onto every entry.
      outcome = result.current.completeService(service(), ILRA)
    })

    expect(outcome?.entry?.memberId).toBe('m-ilra')
  })

  it('refuses a service against a machine the workshop does not have', () => {
    const { result } = renderMaintenance()

    let outcome: ReturnType<typeof result.current.completeService> | undefined
    act(() => {
      outcome = result.current.completeService(service({ machineId: 'ghost-a' }), ILRA)
    })

    expect(outcome?.ok).toBe(false)
    expect(outcome?.reason).toBe('That machine is not in the workshop.')
  })

  it('refuses a service with no notes, and trims the ones it keeps', () => {
    const { result } = renderMaintenance()

    let blank: ReturnType<typeof result.current.completeService> | undefined
    act(() => {
      blank = result.current.completeService(service({ notes: '   ' }), ILRA)
    })
    expect(blank?.ok).toBe(false)

    let kept: ReturnType<typeof result.current.completeService> | undefined
    act(() => {
      kept = result.current.completeService(service({ notes: '  Bled the lines  ' }), ILRA)
    })
    expect(kept?.entry?.notes).toBe('Bled the lines')
  })

  it('keeps the log newest first even when two services land in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const { result } = renderMaintenance()

    act(() => {
      result.current.completeService(service({ notes: 'First' }), ILRA)
    })
    act(() => {
      result.current.completeService(service({ notes: 'Second' }), ILRA)
    })

    expect(result.current.serviceLog.map((entry) => entry.notes)).toEqual(['Second', 'First'])
  })

  it('filters the log by machine', () => {
    const { result } = renderMaintenance()

    act(() => {
      result.current.completeService(service(), ILRA)
    })
    act(() => {
      result.current.completeService(service({ machineId: 'cnc-a', notes: 'Trammed' }), ILRA)
    })

    expect(result.current.serviceLogForMachine('cnc-a')).toHaveLength(1)
    expect(result.current.serviceLogForMachine('printer-b')).toEqual([])
  })

  it('persists windows and services across a remount', async () => {
    const first = renderMaintenance()
    act(() => {
      first.result.current.removeWindow('mw-0001')
      first.result.current.completeService(service(), ILRA)
    })
    first.unmount()

    const second = renderMaintenance()

    await waitFor(() => expect(second.result.current.serviceLog).toHaveLength(1))
    expect(second.result.current.windows.some((window) => window.id === 'mw-0001')).toBe(false)
  })

  it('falls back to the shipped schedule when the stored windows are malformed', () => {
    window.localStorage.setItem('benchclock:maintenance:v1', JSON.stringify([{ id: 'mw-x' }]))

    const { result } = renderMaintenance()

    expect(result.current.windows).toHaveLength(MAINTENANCE_WINDOWS.length)
  })

  it('rejects a stored window whose kind is not one we know', () => {
    window.localStorage.setItem(
      'benchclock:maintenance:v1',
      JSON.stringify([{ ...MAINTENANCE_WINDOWS[0], kind: 'exorcism' }]),
    )

    const { result } = renderMaintenance()

    expect(result.current.windows).toHaveLength(MAINTENANCE_WINDOWS.length)
  })

  it('rejects a stored window that ends before it starts', () => {
    window.localStorage.setItem(
      'benchclock:maintenance:v1',
      JSON.stringify([{ ...MAINTENANCE_WINDOWS[0], endMinute: MAINTENANCE_WINDOWS[0].startMinute }]),
    )

    const { result } = renderMaintenance()

    expect(result.current.windows).toHaveLength(MAINTENANCE_WINDOWS.length)
  })

  it('rejects a stored window that falls outside the week', () => {
    window.localStorage.setItem(
      'benchclock:maintenance:v1',
      JSON.stringify([{ ...MAINTENANCE_WINDOWS[0], startMinute: -30 }]),
    )

    const { result } = renderMaintenance()

    expect(result.current.windows).toHaveLength(MAINTENANCE_WINDOWS.length)
  })

  it('accepts a stored empty schedule, which is a real state', () => {
    window.localStorage.setItem('benchclock:maintenance:v1', JSON.stringify([]))

    const { result } = renderMaintenance()

    expect(result.current.windows).toEqual([])
  })

  it('discards a stored service log that does not match the schema', () => {
    window.localStorage.setItem(
      'benchclock:servicelog:v1',
      JSON.stringify([{ id: 'svc-0001', machineId: 'laser-a' }]),
    )

    const { result } = renderMaintenance()

    expect(result.current.serviceLog).toEqual([])
  })

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useMaintenance())).toThrow(
      /useMaintenance must be used inside a <MaintenanceProvider>/,
    )
  })
})
