import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OccupancyHeatmap } from '@/components/reports/OccupancyHeatmap'
import { occupancyMatrix, type ReportOptions } from '@/lib/reports'
import { weekMinute } from '@/lib/weektime'
import type { Booking, DayWindow, Machine } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

/** Monday 18:00–20:00 and Tuesday 18:00–19:00. */
const HOURS: readonly DayWindow[] = [
  { day: 0, openMinute: 18 * 60, closeMinute: 20 * 60 },
  { day: 1, openMinute: 18 * 60, closeMinute: 19 * 60 },
]

const machine = (over: Partial<Machine> = {}): Machine => ({
  id: 'alpha',
  name: 'Alpha',
  kind: 'laser',
  code: 'AL1',
  requiredTicket: null,
  maxSessionMinutes: 240,
  cooldownMinutes: 0,
  location: 'Bay 1',
  outOfService: false,
  ...over,
})

const OPTIONS: ReportOptions = {
  machines: [machine(), machine({ id: 'beta', name: 'Beta', code: 'BE1' })],
  hours: HOURS,
}

let nextId = 0

function booking(over: Partial<Booking> = {}): Booking {
  nextId += 1
  return {
    id: `bk-${nextId}`,
    machineId: 'alpha',
    memberId: 'm-ilra',
    startMinute: at(0, 18),
    endMinute: at(0, 19),
    note: '',
    createdAt: 0,
    ...over,
  }
}

describe('OccupancyHeatmap', () => {
  it('renders a real table with a caption as its name', () => {
    render(<OccupancyHeatmap matrix={occupancyMatrix([], OPTIONS)} />)

    expect(screen.getByRole('table', { name: 'Occupancy by day and hour' })).toBeInTheDocument()
  })

  it('takes a caption from the caller', () => {
    render(<OccupancyHeatmap matrix={occupancyMatrix([], OPTIONS)} caption="Last week" />)

    expect(screen.getByRole('table', { name: 'Last week' })).toBeInTheDocument()
  })

  it('heads every column with its hour and every row with its day', () => {
    render(<OccupancyHeatmap matrix={occupancyMatrix([], OPTIONS)} />)

    expect(screen.getByRole('columnheader', { name: '18:00' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '19:00' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Monday' })).toBeInTheDocument()
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
  })

  it('names each cell with its day, hour and percentage', () => {
    const matrix = occupancyMatrix([booking({ machineId: 'alpha' })], OPTIONS)
    render(<OccupancyHeatmap matrix={matrix} />)

    expect(screen.getByRole('cell', { name: 'Monday 18:00, 50% booked' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Monday 19:00, 0% booked' })).toBeInTheDocument()
  })

  it('says so in words when a machine-hour is completely full', () => {
    const matrix = occupancyMatrix(
      [
        booking({ machineId: 'alpha', startMinute: at(1, 18), endMinute: at(1, 19) }),
        booking({ machineId: 'beta', startMinute: at(1, 18), endMinute: at(1, 19) }),
      ],
      OPTIONS,
    )
    render(<OccupancyHeatmap matrix={matrix} />)

    expect(screen.getByRole('cell', { name: 'Tuesday 18:00, 100% booked' })).toBeInTheDocument()
  })

  it('marks hours the workshop is shut as closed rather than as empty', () => {
    render(<OccupancyHeatmap matrix={occupancyMatrix([], OPTIONS)} />)

    expect(screen.getByRole('cell', { name: 'Tuesday 19:00, closed' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Sunday 18:00, closed' })).toBeInTheDocument()
  })

  it('closes off each row with an all-day figure', () => {
    const matrix = occupancyMatrix(
      [booking({ machineId: 'alpha', startMinute: at(0, 18), endMinute: at(0, 20) })],
      OPTIONS,
    )
    render(<OccupancyHeatmap matrix={matrix} />)

    expect(screen.getByRole('cell', { name: 'Monday all day, 50% booked' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Saturday all day, closed' })).toBeInTheDocument()
  })

  it('keeps the shading key readable as a list of words', () => {
    render(<OccupancyHeatmap matrix={occupancyMatrix([], OPTIONS)} />)

    const key = screen.getByRole('list', { name: 'Shading key' })
    expect(within(key).getAllByRole('listitem')).toHaveLength(5)
    expect(within(key).getByText('Nearly or fully booked')).toBeInTheDocument()
  })

  it('hides the decorative cell glyphs from assistive technology', () => {
    const matrix = occupancyMatrix([booking()], OPTIONS)
    const { container } = render(<OccupancyHeatmap matrix={matrix} />)

    // Every visible mark is mirrored by hidden text, so nothing is lost.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    expect(screen.getByRole('cell', { name: 'Monday 18:00, 50% booked' })).toHaveTextContent('50')
  })

  it('explains itself instead of rendering an empty grid when nothing is bookable', () => {
    render(<OccupancyHeatmap matrix={occupancyMatrix([], { machines: [machine()], hours: [] })} />)

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/no opening hours to report on/i)).toBeInTheDocument()
  })
})
