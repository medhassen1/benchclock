import { useCallback, useMemo, useRef, useState } from 'react'

import { DAY_NAMES, SLOT_MINUTES } from '@/data/workshop'
import { cx } from '@/lib/cx'
import { formatClock, overlaps, slotsForDay } from '@/lib/weektime'
import type { Booking, DayWindow, Machine, Member } from '@/types'

import styles from './WeekGrid.module.css'

export interface WeekGridProps {
  day: number
  machines: readonly Machine[]
  bookings: readonly Booking[]
  hours: readonly DayWindow[]
  member: Member
  pendingIds: ReadonlySet<string>
  onSelectSlot: (machineId: string, startMinute: number) => void
  onSelectBooking: (booking: Booking) => void
  onSelectMachine: (machine: Machine) => void
}

interface Cell {
  machine: Machine
  startMinute: number
  booking: Booking | undefined
}

/**
 * One row per machine, one column per half-hour slot.
 *
 * The grid is a single tab stop with roving focus: arrow keys move between
 * cells, so a keyboard user reaches any slot without tabbing through every
 * one of them.
 */
export function WeekGrid({
  day,
  machines,
  bookings,
  hours,
  member,
  pendingIds,
  onSelectSlot,
  onSelectBooking,
  onSelectMachine,
}: WeekGridProps) {
  const slots = useMemo(() => slotsForDay(day, hours), [day, hours])
  const [focused, setFocused] = useState({ row: 0, column: 0 })
  const gridRef = useRef<HTMLDivElement>(null)

  // Clamped during render, so a shorter day or a filtered machine list can
  // never leave the roving index pointing at a cell that is gone.
  const row = machines.length === 0 ? 0 : Math.min(focused.row, machines.length - 1)
  const column = slots.length === 0 ? 0 : Math.min(focused.column, slots.length - 1)

  const cellAt = useCallback(
    (rowIndex: number, columnIndex: number): Cell | null => {
      const machine = machines[rowIndex]
      const startMinute = slots[columnIndex]
      if (!machine || startMinute === undefined) return null

      const slot = { startMinute, endMinute: startMinute + SLOT_MINUTES }
      const booking = bookings.find(
        (entry) => entry.machineId === machine.id && overlaps(entry, slot),
      )
      return { machine, startMinute, booking }
    },
    [machines, slots, bookings],
  )

  const moveFocus = useCallback(
    (nextRow: number, nextColumn: number) => {
      const clampedRow = Math.max(0, Math.min(nextRow, machines.length - 1))
      const clampedColumn = Math.max(0, Math.min(nextColumn, slots.length - 1))
      setFocused({ row: clampedRow, column: clampedColumn })

      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-cell="${clampedRow}-${clampedColumn}"]`)
        ?.focus()
    },
    [machines.length, slots.length],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(row, column + 1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(row, column - 1)
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(row + 1, column)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(row - 1, column)
        break
      case 'Home':
        event.preventDefault()
        moveFocus(event.ctrlKey ? 0 : row, 0)
        break
      case 'End':
        event.preventDefault()
        moveFocus(event.ctrlKey ? machines.length - 1 : row, slots.length - 1)
        break
      default:
        break
    }
  }

  if (slots.length === 0) {
    return (
      <p className={styles.closed}>The workshop is closed on {DAY_NAMES[day]}.</p>
    )
  }

  return (
    <div className={styles.scroller}>
      <div
        ref={gridRef}
        role="grid"
        aria-label={`${DAY_NAMES[day]} bookings`}
        aria-rowcount={machines.length + 1}
        aria-colcount={slots.length + 1}
        className={styles.grid}
        style={{ '--slot-count': slots.length } as React.CSSProperties}
        onKeyDown={onKeyDown}
      >
        <div role="row" className={styles.headRow}>
          <span role="columnheader" className={cx(styles.corner, styles.headCell)}>
            <span className="visually-hidden">Machine</span>
          </span>
          {slots.map((slot) => (
            <span key={slot} role="columnheader" className={styles.headCell}>
              {formatClock(slot)}
            </span>
          ))}
        </div>

        {machines.map((machine, rowIndex) => (
          <div role="row" key={machine.id} className={styles.row}>
            <span role="rowheader" className={styles.rowHeader}>
              <button
                type="button"
                className={styles.machineButton}
                onClick={() => onSelectMachine(machine)}
              >
                <span className={styles.machineCode} aria-hidden="true">
                  {machine.code}
                </span>
                <span className={styles.machineName}>{machine.name}</span>
                <span className="visually-hidden">, show details</span>
              </button>
            </span>

            {slots.map((slot, columnIndex) => {
              const cell = cellAt(rowIndex, columnIndex)
              if (!cell) return null

              const { booking } = cell
              const mine = booking?.memberId === member.id
              const isFocusTarget = rowIndex === row && columnIndex === column
              const pending = booking ? pendingIds.has(booking.id) : false

              const label = booking
                ? `${machine.name} at ${formatClock(slot)}, booked${mine ? ' by you' : ''}`
                : `${machine.name} at ${formatClock(slot)}, free`

              return (
                <div role="gridcell" key={slot} className={styles.cellWrap}>
                  <button
                    type="button"
                    data-cell={`${rowIndex}-${columnIndex}`}
                    // Roving tabindex: only the active cell is in the tab order.
                    tabIndex={isFocusTarget ? 0 : -1}
                    className={cx(
                      styles.cell,
                      booking ? (mine ? styles.mine : styles.taken) : styles.free,
                      machine.outOfService && styles.offline,
                      pending && styles.pending,
                    )}
                    aria-label={label}
                    onFocus={() => setFocused({ row: rowIndex, column: columnIndex })}
                    onClick={() =>
                      booking ? onSelectBooking(booking) : onSelectSlot(machine.id, slot)
                    }
                  >
                    <span aria-hidden="true" className={styles.cellMark}>
                      {booking ? (mine ? '●' : '×') : ''}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
