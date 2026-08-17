import { CONSUMABLES, UNIT_LABELS, type Consumable } from '@/data/consumables'
import { MACHINES } from '@/data/workshop'
import { durationOf } from '@/lib/weektime'
import type { Booking, Machine } from '@/types'

/** Quantity on the shelf, keyed by consumable id. */
export type StockLevels = Readonly<Record<string, number>>

export type StockStatus = 'out' | 'low' | 'ok'

export interface DrawOutcome {
  levels: StockLevels
  /** Units actually taken off the shelf. */
  drawn: number
  /** Units asked for that were not there; zero when the draw was met in full. */
  shortfall: number
}

export interface ProjectionOutcome {
  levels: StockLevels
  /** Units the planned work would need beyond what is on the shelf. */
  shortfalls: Readonly<Record<string, number>>
}

export interface UsageOptions {
  items?: readonly Consumable[]
  machines?: readonly Machine[]
}

/**
 * Quantities are kept to whole hundredths. Draws are computed from fractional
 * rates, and without rounding a shelf that should read 0 drifts to 1e-16 and
 * stops looking empty.
 */
function round(quantity: number): number {
  return Math.round(quantity * 100) / 100
}

/** Anything that is not a usable, non-negative number counts as nothing. */
function clean(quantity: unknown): number {
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0
    ? round(quantity)
    : 0
}

/** The shelf as it stands at the start of the week. */
export function openingLevels(items: readonly Consumable[] = CONSUMABLES): StockLevels {
  const levels: Record<string, number> = {}
  for (const item of items) {
    levels[item.id] = clean(item.openingQuantity)
  }
  return levels
}

export function quantityOf(levels: StockLevels, itemId: string): number {
  return clean(levels[itemId])
}

/**
 * Takes `amount` off the shelf. Stock never goes below zero: whatever is there
 * is handed over and the rest is reported as a shortfall, so the caller can
 * tell the member how much they will have to order.
 */
export function applyDraw(levels: StockLevels, itemId: string, amount: number): DrawOutcome {
  const wanted = clean(amount)
  const available = quantityOf(levels, itemId)
  const drawn = Math.min(available, wanted)

  return {
    levels: { ...levels, [itemId]: round(available - drawn) },
    drawn: round(drawn),
    shortfall: round(wanted - drawn),
  }
}

/** Adds `amount` to the shelf. A zero or nonsense amount changes nothing. */
export function applyRestock(levels: StockLevels, itemId: string, amount: number): StockLevels {
  const added = clean(amount)
  if (added === 0) return levels

  return { ...levels, [itemId]: round(quantityOf(levels, itemId) + added) }
}

/**
 * `low` covers an item sitting exactly on its threshold: the threshold is the
 * point at which to reorder, not the point below it.
 */
export function stockStatus(item: Consumable, levels: StockLevels): StockStatus {
  const quantity = quantityOf(levels, item.id)
  if (quantity === 0) return 'out'
  return quantity <= item.reorderThreshold ? 'low' : 'ok'
}

export function isLow(item: Consumable, levels: StockLevels): boolean {
  return stockStatus(item, levels) !== 'ok'
}

/** Everything needing an order, emptiest first. */
export function lowStockItems(
  levels: StockLevels,
  items: readonly Consumable[] = CONSUMABLES,
): Consumable[] {
  return items
    .filter((item) => isLow(item, levels))
    .sort((a, b) => quantityOf(levels, a.id) - quantityOf(levels, b.id))
}

/** 0–1 against the opening quantity, clamped, and 0 when there is no full mark. */
export function stockFraction(item: Consumable, levels: StockLevels): number {
  const full = clean(item.openingQuantity)
  if (full === 0) return 0
  return Math.min(1, quantityOf(levels, item.id) / full)
}

/** Units an item gives up over `minutes` of machine time. */
export function drawForMinutes(item: Consumable, minutes: number): number {
  if (minutes <= 0 || item.unitsPerHour <= 0) return 0
  return round((item.unitsPerHour * minutes) / 60)
}

/**
 * Units each consumable would give up to the bookings on the board. A booking
 * for a machine that is no longer on the roster draws nothing rather than
 * throwing, since the board can outlive a machine.
 */
export function plannedUsage(
  bookings: readonly Booking[],
  { items = CONSUMABLES, machines = MACHINES }: UsageOptions = {},
): Readonly<Record<string, number>> {
  const usage: Record<string, number> = {}

  for (const booking of bookings) {
    const machine = machines.find((entry) => entry.id === booking.machineId)
    if (!machine) continue

    const minutes = durationOf(booking)
    if (minutes <= 0) continue

    for (const item of items) {
      if (!item.consumedBy.includes(machine.kind)) continue
      usage[item.id] = round((usage[item.id] ?? 0) + drawForMinutes(item, minutes))
    }
  }

  return usage
}

/**
 * Where the shelf lands once every planned booking has run. Clamped at zero
 * like a real draw, with the unmet part reported so the page can say which
 * jobs will run dry.
 */
export function projectLevels(
  levels: StockLevels,
  bookings: readonly Booking[],
  options: UsageOptions = {},
): ProjectionOutcome {
  const usage = plannedUsage(bookings, options)
  let projected = levels
  const shortfalls: Record<string, number> = {}

  for (const [itemId, amount] of Object.entries(usage)) {
    const outcome = applyDraw(projected, itemId, amount)
    projected = outcome.levels
    if (outcome.shortfall > 0) shortfalls[itemId] = outcome.shortfall
  }

  return { levels: projected, shortfalls }
}

/** `1 sheet`, `2.5 litres`, `0 spools`. */
export function formatQuantity(item: Consumable, quantity: number): string {
  const safe = clean(quantity)
  const label = UNIT_LABELS[item.unit]
  return `${safe} ${safe === 1 ? label.one : label.many}`
}
