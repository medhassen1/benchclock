import { describe, expect, it } from 'vitest'

import { MACHINES, MEMBERS, OPENING_HOURS } from '@/data/workshop'
import {
  applyOverrides,
  clearDayOverrides,
  clearMachineOverride,
  clockToMinutes,
  dayDraftsFrom,
  effectiveMachines,
  effectiveMembers,
  effectiveOpeningHours,
  EMPTY_OVERRIDES,
  hasOverrides,
  machineDraftFrom,
  memberDraftFrom,
  minutesToClock,
  setDayOverride,
  setMachineOverride,
  setMemberOverride,
  validateDayDraft,
  validateMachineDraft,
  validateMemberDraft,
  type DayDraft,
  type MachineDraft,
  type WorkshopOverrides,
} from '@/lib/workshopConfig'
import { isWithinOpeningHours } from '@/lib/weektime'

const laser = MACHINES.find((machine) => machine.id === 'laser-a')!
const ilra = MEMBERS.find((member) => member.id === 'm-ilra')!

const machineDraft = (over: Partial<MachineDraft> = {}): MachineDraft => ({
  ...machineDraftFrom(laser),
  ...over,
})

const dayDraft = (over: Partial<DayDraft> = {}): DayDraft => ({
  day: 0,
  closed: false,
  openMinute: 9 * 60,
  closeMinute: 17 * 60,
  ...over,
})

/** Applies an edit and asserts it was accepted, returning the new overrides. */
function accept(result: { overrides: WorkshopOverrides; errors: readonly unknown[] }) {
  expect(result.errors).toEqual([])
  return result.overrides
}

describe('effectiveMachines', () => {
  it('returns the shipped fixtures when nothing is overridden', () => {
    expect(effectiveMachines(EMPTY_OVERRIDES)).toEqual([...MACHINES])
  })

  it('layers a patch over one machine and leaves the rest alone', () => {
    const overrides = accept(
      setMachineOverride(EMPTY_OVERRIDES, 'laser-a', machineDraft({ maxSessionMinutes: 60 })),
    )

    const machines = effectiveMachines(overrides)
    expect(machines[0]).toMatchObject({ id: 'laser-a', maxSessionMinutes: 60, name: 'Big laser' })
    expect(machines[1]).toEqual(MACHINES[1])
  })

  it('keeps fields the patch does not mention following the fixture', () => {
    const overrides: WorkshopOverrides = {
      ...EMPTY_OVERRIDES,
      machines: { 'laser-a': { outOfService: true } },
    }

    expect(effectiveMachines(overrides)[0]).toMatchObject({
      outOfService: true,
      cooldownMinutes: laser.cooldownMinutes,
      location: laser.location,
    })
  })

  it('can clear a required sign-off', () => {
    const overrides = accept(
      setMachineOverride(EMPTY_OVERRIDES, 'laser-a', machineDraft({ requiredTicket: null })),
    )

    expect(effectiveMachines(overrides)[0].requiredTicket).toBeNull()
  })

  it('ignores a patch for a machine that is no longer in the fixtures', () => {
    const overrides: WorkshopOverrides = {
      ...EMPTY_OVERRIDES,
      machines: { 'ghost-machine': { name: 'Gone' } },
    }

    expect(effectiveMachines(overrides)).toHaveLength(MACHINES.length)
  })
})

describe('effectiveMembers', () => {
  it('returns the roster untouched when nothing is overridden', () => {
    expect(effectiveMembers(EMPTY_OVERRIDES)).toEqual([...MEMBERS])
  })

  it('applies a tier and allowance edit', () => {
    const overrides = accept(
      setMemberOverride(EMPTY_OVERRIDES, 'm-pia', {
        ...memberDraftFrom(MEMBERS[3]),
        tier: 'regular',
        weeklyMinuteAllowance: 480,
      }),
    )

    expect(effectiveMembers(overrides)[3]).toMatchObject({
      tier: 'regular',
      weeklyMinuteAllowance: 480,
    })
  })

  it('records a change to the sign-offs a member holds', () => {
    const overrides = accept(
      setMemberOverride(EMPTY_OVERRIDES, 'm-pia', {
        ...memberDraftFrom(MEMBERS[3]),
        tickets: ['textiles'],
      }),
    )

    expect(effectiveMembers(overrides)[3].tickets).toEqual(['textiles'])
  })

  it('treats a re-ordered ticket list as no change at all', () => {
    const overrides = accept(
      setMemberOverride(EMPTY_OVERRIDES, 'm-ilra', {
        ...memberDraftFrom(ilra),
        tickets: [...ilra.tickets].reverse(),
      }),
    )

    expect(hasOverrides(overrides)).toBe(false)
  })
})

describe('effectiveOpeningHours', () => {
  it('returns the shipped week when nothing is overridden', () => {
    expect(effectiveOpeningHours(EMPTY_OVERRIDES)).toEqual([...OPENING_HOURS])
  })

  it('replaces one day and keeps the others', () => {
    const overrides = accept(
      setDayOverride(EMPTY_OVERRIDES, dayDraft({ day: 0, openMinute: 8 * 60, closeMinute: 12 * 60 })),
    )

    const hours = effectiveOpeningHours(overrides)
    expect(hours[0]).toEqual({ day: 0, openMinute: 480, closeMinute: 720 })
    expect(hours[1]).toEqual(OPENING_HOURS[1])
  })

  it('drops a closed day from the week entirely', () => {
    const overrides = accept(setDayOverride(EMPTY_OVERRIDES, dayDraft({ day: 2, closed: true })))

    const hours = effectiveOpeningHours(overrides)
    expect(hours).toHaveLength(6)
    expect(hours.some((window) => window.day === 2)).toBe(false)
  })

  it('makes a closed day unbookable for the rest of the app', () => {
    const overrides = accept(setDayOverride(EMPTY_OVERRIDES, dayDraft({ day: 0, closed: true })))
    const hours = effectiveOpeningHours(overrides)

    // Monday 18:00–19:00, which the shipped hours allow.
    const monday = { startMinute: 18 * 60, endMinute: 19 * 60 }
    expect(isWithinOpeningHours(monday, OPENING_HOURS)).toBe(true)
    expect(isWithinOpeningHours(monday, hours)).toBe(false)
  })

  it('remembers the times of a day that is closed, so re-opening restores them', () => {
    const closed = accept(
      setDayOverride(
        EMPTY_OVERRIDES,
        dayDraft({ day: 0, closed: true, openMinute: 8 * 60, closeMinute: 11 * 60 }),
      ),
    )

    const drafts = dayDraftsFrom(closed)
    expect(drafts[0]).toEqual({ day: 0, closed: true, openMinute: 480, closeMinute: 660 })
  })
})

describe('applyOverrides', () => {
  it('produces machines, members, and hours in one pass', () => {
    const effective = applyOverrides(EMPTY_OVERRIDES)

    expect(effective.machines).toHaveLength(MACHINES.length)
    expect(effective.members).toHaveLength(MEMBERS.length)
    expect(effective.hours).toHaveLength(OPENING_HOURS.length)
  })

  it('accepts a base other than the shipped fixtures', () => {
    const effective = applyOverrides(EMPTY_OVERRIDES, {
      machines: [laser],
      members: [ilra],
      hours: [{ day: 0, openMinute: 60, closeMinute: 120 }],
    })

    expect(effective.machines).toHaveLength(1)
    expect(effective.hours).toEqual([{ day: 0, openMinute: 60, closeMinute: 120 }])
  })
})

describe('validateMachineDraft', () => {
  it('accepts the shipped values', () => {
    expect(validateMachineDraft(machineDraft())).toEqual([])
  })

  it('refuses a blank name', () => {
    const errors = validateMachineDraft(machineDraft({ name: '   ' }))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ code: 'name-required', field: 'name' })
  })

  it('refuses a zero-length session', () => {
    const errors = validateMachineDraft(machineDraft({ maxSessionMinutes: 0 }))

    expect(errors[0]).toMatchObject({ code: 'session-not-positive', field: 'maxSessionMinutes' })
  })

  it('refuses a negative session length', () => {
    const errors = validateMachineDraft(machineDraft({ maxSessionMinutes: -30 }))

    expect(errors[0].code).toBe('session-not-positive')
  })

  it('refuses a session length that is not a whole number of slots', () => {
    const errors = validateMachineDraft(machineDraft({ maxSessionMinutes: 45 }))

    expect(errors[0]).toMatchObject({ code: 'session-not-aligned', field: 'maxSessionMinutes' })
    expect(errors[0].message).toContain('30')
  })

  it('refuses a session length that is not a number at all', () => {
    const errors = validateMachineDraft(machineDraft({ maxSessionMinutes: Number.NaN }))

    expect(errors[0].code).toBe('session-invalid')
  })

  it('refuses a negative cool-down but allows zero', () => {
    expect(validateMachineDraft(machineDraft({ cooldownMinutes: 0 }))).toEqual([])

    const errors = validateMachineDraft(machineDraft({ cooldownMinutes: -1 }))
    expect(errors[0]).toMatchObject({ code: 'cooldown-negative', field: 'cooldownMinutes' })
  })

  it('reports every broken field at once', () => {
    const errors = validateMachineDraft(
      machineDraft({ name: '', maxSessionMinutes: 0, cooldownMinutes: -5 }),
    )

    expect(errors.map((error) => error.field)).toEqual([
      'name',
      'maxSessionMinutes',
      'cooldownMinutes',
    ])
  })

  it('never throws on a hostile draft', () => {
    expect(() =>
      validateMachineDraft(
        machineDraft({ maxSessionMinutes: Number.POSITIVE_INFINITY, cooldownMinutes: Number.NaN }),
      ),
    ).not.toThrow()
  })
})

describe('validateMemberDraft', () => {
  it('accepts the shipped values', () => {
    expect(validateMemberDraft(memberDraftFrom(ilra))).toEqual([])
  })

  it('refuses a negative allowance', () => {
    const errors = validateMemberDraft({ ...memberDraftFrom(ilra), weeklyMinuteAllowance: -60 })

    expect(errors[0]).toMatchObject({ code: 'allowance-negative', field: 'weeklyMinuteAllowance' })
  })

  it('refuses an allowance that is not a number', () => {
    const errors = validateMemberDraft({
      ...memberDraftFrom(ilra),
      weeklyMinuteAllowance: Number.NaN,
    })

    expect(errors[0].code).toBe('allowance-invalid')
  })
})

describe('validateDayDraft', () => {
  it('accepts a window that runs forwards inside its day', () => {
    expect(validateDayDraft(dayDraft())).toEqual([])
  })

  it('refuses a window that closes before it opens', () => {
    const errors = validateDayDraft(dayDraft({ openMinute: 17 * 60, closeMinute: 9 * 60 }))

    expect(errors[0]).toMatchObject({ code: 'window-order', field: 'closeMinute', day: 0 })
  })

  it('refuses a window with no length', () => {
    const errors = validateDayDraft(dayDraft({ openMinute: 600, closeMinute: 600 }))

    expect(errors[0].code).toBe('window-order')
  })

  it('refuses a window that runs past midnight', () => {
    const errors = validateDayDraft(dayDraft({ openMinute: 20 * 60, closeMinute: 25 * 60 }))

    expect(errors[0].code).toBe('window-outside-day')
  })

  it('refuses a negative opening time', () => {
    const errors = validateDayDraft(dayDraft({ openMinute: -30 }))

    expect(errors[0]).toMatchObject({ code: 'window-outside-day', field: 'openMinute' })
  })

  it('refuses a time that could not be read at all', () => {
    const errors = validateDayDraft(dayDraft({ closeMinute: Number.NaN }))

    expect(errors[0]).toMatchObject({ code: 'window-invalid', field: 'closeMinute' })
  })

  it('allows midnight as a closing time', () => {
    expect(validateDayDraft(dayDraft({ openMinute: 20 * 60, closeMinute: 24 * 60 }))).toEqual([])
  })

  it('ignores the times of a closed day', () => {
    expect(validateDayDraft(dayDraft({ closed: true, openMinute: 900, closeMinute: 60 }))).toEqual(
      [],
    )
  })
})

describe('recording edits', () => {
  it('refuses an invalid machine edit and leaves the overrides untouched', () => {
    const result = setMachineOverride(
      EMPTY_OVERRIDES,
      'laser-a',
      machineDraft({ maxSessionMinutes: 0 }),
    )

    expect(result.errors.map((error) => error.code)).toEqual(['session-not-positive'])
    expect(result.overrides).toBe(EMPTY_OVERRIDES)
  })

  it('refuses an invalid day edit and leaves the overrides untouched', () => {
    const result = setDayOverride(EMPTY_OVERRIDES, dayDraft({ openMinute: 600, closeMinute: 300 }))

    expect(result.errors.map((error) => error.code)).toEqual(['window-order'])
    expect(result.overrides).toBe(EMPTY_OVERRIDES)
  })

  it('stores nothing when an edit matches the fixture', () => {
    const overrides = accept(setMachineOverride(EMPTY_OVERRIDES, 'laser-a', machineDraft()))

    expect(hasOverrides(overrides)).toBe(false)
  })

  it('drops the patch when a machine is edited back to its defaults', () => {
    const edited = accept(
      setMachineOverride(EMPTY_OVERRIDES, 'laser-a', machineDraft({ name: 'Huge laser' })),
    )
    expect(hasOverrides(edited)).toBe(true)

    const restored = accept(setMachineOverride(edited, 'laser-a', machineDraft()))
    expect(hasOverrides(restored)).toBe(false)
    expect(effectiveMachines(restored)[0]).toEqual(laser)
  })

  it('drops the patch when a day is edited back to its default window', () => {
    const edited = accept(setDayOverride(EMPTY_OVERRIDES, dayDraft({ day: 0, closed: true })))
    expect(hasOverrides(edited)).toBe(true)

    const restored = accept(
      setDayOverride(
        edited,
        dayDraft({
          day: 0,
          openMinute: OPENING_HOURS[0].openMinute,
          closeMinute: OPENING_HOURS[0].closeMinute,
        }),
      ),
    )

    expect(hasOverrides(restored)).toBe(false)
  })

  it('trims whitespace from names and locations before comparing', () => {
    const overrides = accept(
      setMachineOverride(
        EMPTY_OVERRIDES,
        'laser-a',
        machineDraft({ name: '  Big laser  ', location: ' Bay 1 ' }),
      ),
    )

    expect(hasOverrides(overrides)).toBe(false)
  })

  it('ignores an edit aimed at a machine that does not exist', () => {
    const result = setMachineOverride(EMPTY_OVERRIDES, 'nope', machineDraft())

    expect(result.overrides).toBe(EMPTY_OVERRIDES)
    expect(result.errors).toEqual([])
  })

  it('ignores an edit aimed at a member who does not exist', () => {
    const result = setMemberOverride(EMPTY_OVERRIDES, 'nope', memberDraftFrom(ilra))

    expect(result.overrides).toBe(EMPTY_OVERRIDES)
  })

  it('clears one machine back to the fixture', () => {
    const edited = accept(
      setMachineOverride(EMPTY_OVERRIDES, 'laser-a', machineDraft({ outOfService: true })),
    )

    const cleared = clearMachineOverride(edited, 'laser-a')
    expect(effectiveMachines(cleared)[0]).toEqual(laser)
    expect(hasOverrides(cleared)).toBe(false)
  })

  it('clears every day back to the shipped week', () => {
    let overrides = accept(setDayOverride(EMPTY_OVERRIDES, dayDraft({ day: 0, closed: true })))
    overrides = accept(setDayOverride(overrides, dayDraft({ day: 1, closed: true })))

    const cleared = clearDayOverrides(overrides)
    expect(effectiveOpeningHours(cleared)).toEqual([...OPENING_HOURS])
  })

  it('never mutates the overrides it was given', () => {
    const before = JSON.stringify(EMPTY_OVERRIDES)
    accept(setMachineOverride(EMPTY_OVERRIDES, 'laser-a', machineDraft({ name: 'Changed' })))

    expect(JSON.stringify(EMPTY_OVERRIDES)).toBe(before)
  })
})

describe('dayDraftsFrom', () => {
  it('returns one draft per day of the week', () => {
    const drafts = dayDraftsFrom(EMPTY_OVERRIDES)

    expect(drafts).toHaveLength(7)
    expect(drafts[0]).toEqual({ day: 0, closed: false, openMinute: 1020, closeMinute: 1320 })
  })

  it('marks a day the fixtures never open as closed, with usable placeholder times', () => {
    const drafts = dayDraftsFrom(EMPTY_OVERRIDES, [OPENING_HOURS[0]])

    expect(drafts[1].closed).toBe(true)
    expect(drafts[1].openMinute).toBeGreaterThan(0)
    expect(drafts[1].closeMinute).toBeGreaterThan(drafts[1].openMinute)
  })
})

describe('clock text', () => {
  it('reads a 24-hour time', () => {
    expect(clockToMinutes('17:30')).toBe(1050)
    expect(clockToMinutes('00:00')).toBe(0)
    expect(clockToMinutes('9:05')).toBe(545)
    expect(clockToMinutes(' 24:00 ')).toBe(1440)
  })

  it('refuses anything that is not a time of day', () => {
    expect(clockToMinutes('')).toBeNull()
    expect(clockToMinutes('half five')).toBeNull()
    expect(clockToMinutes('25:00')).toBeNull()
    expect(clockToMinutes('12:60')).toBeNull()
    expect(clockToMinutes('24:30')).toBeNull()
    expect(clockToMinutes('1730')).toBeNull()
  })

  it('writes a time back out, padded', () => {
    expect(minutesToClock(1050)).toBe('17:30')
    expect(minutesToClock(0)).toBe('00:00')
    expect(minutesToClock(1440)).toBe('24:00')
  })

  it('clamps a time that fell outside the day', () => {
    expect(minutesToClock(-60)).toBe('00:00')
    expect(minutesToClock(9999)).toBe('24:00')
  })

  it('round-trips every half hour of the day', () => {
    for (let minute = 0; minute <= 1440; minute += 30) {
      expect(clockToMinutes(minutesToClock(minute))).toBe(minute)
    }
  })
})
