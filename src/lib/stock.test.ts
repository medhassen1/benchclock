import { describe, expect, it } from 'vitest'

import { CONSUMABLES, CONSUMABLES_BY_ID, type Consumable } from '@/data/consumables'
import {
  applyDraw,
  applyRestock,
  drawForMinutes,
  formatQuantity,
  isLow,
  lowStockItems,
  openingLevels,
  plannedUsage,
  projectLevels,
  quantityOf,
  stockFraction,
  stockStatus,
  type StockLevels,
} from '@/lib/stock'
import { weekMinute } from '@/lib/weektime'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const item = (id: string): Consumable => {
  const found = CONSUMABLES_BY_ID.get(id)
  if (!found) throw new Error(`no consumable ${id}`)
  return found
}

/** One sheet per hour, reorder at 6, 24 on the shelf. */
const PLY = item('ply-3mm')
/** Opens exactly on its threshold of 3 kg. */
const WIRE = item('welding-wire')

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-1',
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 20),
  note: '',
  createdAt: 0,
  ...over,
})

describe('the fixture stock list', () => {
  it('gives every item a unique id and a sane threshold', () => {
    expect(CONSUMABLES_BY_ID.size).toBe(CONSUMABLES.length)

    for (const entry of CONSUMABLES) {
      expect(entry.openingQuantity).toBeGreaterThanOrEqual(0)
      expect(entry.reorderThreshold).toBeGreaterThanOrEqual(0)
      expect(entry.consumedBy.length).toBeGreaterThan(0)
    }
  })

  it('starts every item at its opening quantity', () => {
    const levels = openingLevels()

    expect(quantityOf(levels, PLY.id)).toBe(24)
    expect(Object.keys(levels)).toHaveLength(CONSUMABLES.length)
  })
})

describe('reading a level', () => {
  it('treats an unknown item as empty', () => {
    expect(quantityOf({}, 'nothing-here')).toBe(0)
  })

  it('treats a corrupt or negative level as empty', () => {
    const levels = { a: Number.NaN, b: -5, c: Number.POSITIVE_INFINITY } as StockLevels

    expect(quantityOf(levels, 'a')).toBe(0)
    expect(quantityOf(levels, 'b')).toBe(0)
    expect(quantityOf(levels, 'c')).toBe(0)
  })
})

describe('drawing stock', () => {
  it('takes what was asked for when it is there', () => {
    const outcome = applyDraw({ [PLY.id]: 10 }, PLY.id, 4)

    expect(outcome.drawn).toBe(4)
    expect(outcome.shortfall).toBe(0)
    expect(quantityOf(outcome.levels, PLY.id)).toBe(6)
  })

  it('never goes below zero, and reports the shortfall', () => {
    const outcome = applyDraw({ [PLY.id]: 2 }, PLY.id, 5)

    expect(outcome.drawn).toBe(2)
    expect(outcome.shortfall).toBe(3)
    expect(quantityOf(outcome.levels, PLY.id)).toBe(0)
  })

  it('reports the whole draw as short when the shelf is empty', () => {
    const outcome = applyDraw({ [PLY.id]: 0 }, PLY.id, 3)

    expect(outcome.drawn).toBe(0)
    expect(outcome.shortfall).toBe(3)
  })

  it('ignores a zero or negative draw', () => {
    expect(applyDraw({ [PLY.id]: 5 }, PLY.id, 0).levels[PLY.id]).toBe(5)
    expect(applyDraw({ [PLY.id]: 5 }, PLY.id, -2)).toMatchObject({ drawn: 0, shortfall: 0 })
  })

  it('leaves the levels it was given untouched', () => {
    const levels = { [PLY.id]: 10 }
    applyDraw(levels, PLY.id, 4)

    expect(levels[PLY.id]).toBe(10)
  })

  it('keeps fractional draws free of float dust', () => {
    let levels: StockLevels = { resin: 1 }
    for (let i = 0; i < 5; i += 1) {
      levels = applyDraw(levels, 'resin', 0.2).levels
    }

    expect(quantityOf(levels, 'resin')).toBe(0)
  })
})

describe('restocking', () => {
  it('adds to what is already there', () => {
    expect(quantityOf(applyRestock({ [PLY.id]: 6 }, PLY.id, 12), PLY.id)).toBe(18)
  })

  it('brings an item back from zero', () => {
    const levels = applyRestock({ [PLY.id]: 0 }, PLY.id, 24)

    expect(quantityOf(levels, PLY.id)).toBe(24)
    expect(stockStatus(PLY, levels)).toBe('ok')
  })

  it('creates a level for an item that had none recorded', () => {
    expect(quantityOf(applyRestock({}, PLY.id, 3), PLY.id)).toBe(3)
  })

  it('ignores a zero or negative restock', () => {
    const levels = { [PLY.id]: 4 }

    expect(applyRestock(levels, PLY.id, 0)).toBe(levels)
    expect(applyRestock(levels, PLY.id, -9)).toBe(levels)
  })
})

describe('low stock', () => {
  it('warns at exactly the reorder threshold', () => {
    const levels = { [WIRE.id]: WIRE.reorderThreshold }

    expect(stockStatus(WIRE, levels)).toBe('low')
    expect(isLow(WIRE, levels)).toBe(true)
  })

  it('stays quiet one unit above the threshold', () => {
    const levels = { [WIRE.id]: WIRE.reorderThreshold + 1 }

    expect(stockStatus(WIRE, levels)).toBe('ok')
    expect(isLow(WIRE, levels)).toBe(false)
  })

  it('calls an empty shelf out rather than low', () => {
    expect(stockStatus(WIRE, { [WIRE.id]: 0 })).toBe('out')
    expect(stockStatus(WIRE, {})).toBe('out')
  })

  it('lists everything needing an order, emptiest first', () => {
    const levels = { ...openingLevels(), [PLY.id]: 1, [WIRE.id]: 3 }
    const low = lowStockItems(levels)

    expect(low.map((entry) => entry.id).slice(0, 2)).toEqual([PLY.id, WIRE.id])
  })
})

describe('the fill fraction', () => {
  it('is one on a full shelf and zero on an empty one', () => {
    expect(stockFraction(PLY, { [PLY.id]: PLY.openingQuantity })).toBe(1)
    expect(stockFraction(PLY, { [PLY.id]: 0 })).toBe(0)
  })

  it('never exceeds one after an over-restock', () => {
    expect(stockFraction(PLY, { [PLY.id]: 100 })).toBe(1)
  })

  it('is zero rather than NaN for an item with no opening quantity', () => {
    const odd: Consumable = { ...PLY, openingQuantity: 0 }

    expect(stockFraction(odd, { [PLY.id]: 5 })).toBe(0)
  })
})

describe('usage drawn by bookings', () => {
  it('scales with the length of the booking', () => {
    expect(drawForMinutes(PLY, 120)).toBe(2)
    expect(drawForMinutes(PLY, 30)).toBe(0.5)
  })

  it('draws nothing for a zero-length or backwards booking', () => {
    expect(drawForMinutes(PLY, 0)).toBe(0)
    expect(drawForMinutes(PLY, -60)).toBe(0)
  })

  it('draws nothing for an item with no rate', () => {
    expect(drawForMinutes({ ...PLY, unitsPerHour: 0 }, 120)).toBe(0)
  })

  it('charges every item the machine kind consumes', () => {
    const usage = plannedUsage([booking()])

    // Two hours on a laser: plywood at 1/h, acrylic at 0.5/h.
    expect(usage[PLY.id]).toBe(2)
    expect(usage['acrylic-3mm']).toBe(1)
    expect(usage['pla-filament']).toBeUndefined()
  })

  it('adds up several bookings on the same item', () => {
    const usage = plannedUsage([
      booking({ id: 'bk-1' }),
      booking({ id: 'bk-2', machineId: 'cnc-a', startMinute: at(1, 18), endMinute: at(1, 19) }),
    ])

    expect(usage[PLY.id]).toBe(3)
  })

  it('ignores a booking for a machine that is no longer on the roster', () => {
    expect(plannedUsage([booking({ machineId: 'ghost' })])).toEqual({})
  })

  it('ignores a zero-length booking', () => {
    expect(plannedUsage([booking({ endMinute: at(0, 18) })])).toEqual({})
  })
})

describe('projecting the shelf forward', () => {
  it('subtracts the planned work from what is there', () => {
    const { levels, shortfalls } = projectLevels(openingLevels(), [booking()])

    expect(quantityOf(levels, PLY.id)).toBe(22)
    expect(quantityOf(levels, 'acrylic-3mm')).toBe(8)
    expect(shortfalls).toEqual({})
  })

  it('clamps at zero and names what will run dry', () => {
    const levels = { ...openingLevels(), [PLY.id]: 1 }
    const projected = projectLevels(levels, [booking()])

    expect(quantityOf(projected.levels, PLY.id)).toBe(0)
    expect(projected.shortfalls[PLY.id]).toBe(1)
  })

  it('leaves the shelf alone when nothing is booked', () => {
    expect(projectLevels(openingLevels(), []).levels).toEqual(openingLevels())
  })
})

describe('writing a quantity', () => {
  it('uses the singular for exactly one', () => {
    expect(formatQuantity(PLY, 1)).toBe('1 sheet')
    expect(formatQuantity(PLY, 2)).toBe('2 sheets')
    expect(formatQuantity(PLY, 0)).toBe('0 sheets')
  })

  it('keeps a fraction readable', () => {
    expect(formatQuantity(item('resin'), 2.5)).toBe('2.5 litres')
  })

  it('shows a corrupt quantity as nothing on the shelf', () => {
    expect(formatQuantity(PLY, Number.NaN)).toBe('0 sheets')
  })
})
