import type { MachineKind } from '@/types'

/** The physical unit stock is counted in. */
export type ConsumableUnit = 'sheet' | 'spool' | 'metre' | 'kilogram' | 'litre' | 'item'

export interface UnitLabel {
  one: string
  many: string
}

/** Both forms, so quantities can be written as prose rather than `1 sheets`. */
export const UNIT_LABELS: Readonly<Record<ConsumableUnit, UnitLabel>> = {
  sheet: { one: 'sheet', many: 'sheets' },
  spool: { one: 'spool', many: 'spools' },
  metre: { one: 'metre', many: 'metres' },
  kilogram: { one: 'kilogram', many: 'kilograms' },
  litre: { one: 'litre', many: 'litres' },
  item: { one: 'item', many: 'items' },
}

export interface Consumable {
  id: string
  name: string
  unit: ConsumableUnit
  /** Quantity on the shelf when the week starts, and the meter's full mark. */
  openingQuantity: number
  /** Order more once stock reaches this level or falls below it. */
  reorderThreshold: number
  /** Machine kinds that draw on this item. */
  consumedBy: readonly MachineKind[]
  /** Units drawn per hour of machine time, used to project stock forward. */
  unitsPerHour: number
}

export const CONSUMABLES: readonly Consumable[] = [
  {
    id: 'ply-3mm',
    name: 'Plywood 3 mm',
    unit: 'sheet',
    openingQuantity: 24,
    reorderThreshold: 6,
    consumedBy: ['laser', 'cnc'],
    unitsPerHour: 1,
  },
  {
    id: 'acrylic-3mm',
    name: 'Acrylic 3 mm',
    unit: 'sheet',
    openingQuantity: 9,
    reorderThreshold: 4,
    consumedBy: ['laser'],
    unitsPerHour: 0.5,
  },
  {
    id: 'pla-filament',
    name: 'PLA filament',
    unit: 'spool',
    openingQuantity: 6,
    reorderThreshold: 2,
    consumedBy: ['printer3d'],
    unitsPerHour: 0.25,
  },
  {
    id: 'resin',
    name: 'Photopolymer resin',
    unit: 'litre',
    openingQuantity: 4,
    reorderThreshold: 1,
    consumedBy: ['printer3d'],
    unitsPerHour: 0.2,
  },
  {
    // Starts exactly on its threshold, so the board opens with a real warning.
    id: 'welding-wire',
    name: 'MIG welding wire',
    unit: 'kilogram',
    openingQuantity: 3,
    reorderThreshold: 3,
    consumedBy: ['welder'],
    unitsPerHour: 0.5,
  },
  {
    id: 'alu-bar',
    name: 'Aluminium bar stock',
    unit: 'metre',
    openingQuantity: 12,
    reorderThreshold: 4,
    consumedBy: ['lathe'],
    unitsPerHour: 0.5,
  },
  {
    id: 'overlock-thread',
    name: 'Overlocker thread',
    unit: 'spool',
    openingQuantity: 10,
    reorderThreshold: 3,
    consumedBy: ['sewing'],
    unitsPerHour: 0.25,
  },
  {
    id: 'router-bits',
    name: 'CNC router bits',
    unit: 'item',
    openingQuantity: 5,
    reorderThreshold: 2,
    consumedBy: ['cnc'],
    unitsPerHour: 0.1,
  },
]

export const CONSUMABLES_BY_ID: ReadonlyMap<string, Consumable> = new Map(
  CONSUMABLES.map((item) => [item.id, item]),
)
