import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ReportsPage } from '@/components/reports/ReportsPage'
import { weekMinute } from '@/lib/weektime'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

function seed(bookings: Booking[]) {
  window.localStorage.setItem('benchclock:bookings:v1', JSON.stringify(bookings))
}

function seedBaseline(bookings: Booking[]) {
  window.localStorage.setItem('benchclock:reports:baseline:v1', JSON.stringify(bookings))
}

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-0001',
  machineId: 'printer-b',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 21),
  note: '',
  createdAt: 1,
  ...over,
})

const tile = (name: string) => screen.getByRole('group', { name })

/** Each report lives in its own labelled section, so the table is unambiguous. */
const tableFor = (section: string) =>
  within(screen.getByRole('region', { name: section })).getByRole('table')

describe('ReportsPage', () => {
  it('reports an idle week without a single NaN', () => {
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    expect(tile('Workshop utilisation')).toHaveTextContent('0%')
    expect(tile('Machine time booked')).toHaveTextContent('0 m')
    expect(tile('Busiest machine')).toHaveTextContent('Nothing booked')
    expect(tile('Members booking')).toHaveTextContent('0')
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('measures booked time against the bookable hours', () => {
    seed([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    expect(tile('Machine time booked')).toHaveTextContent('3 h')
    expect(tile('Machine time booked')).toHaveTextContent('Across 1 booking')
    expect(tile('Busiest machine')).toHaveTextContent('Filament printer')
    expect(tile('Members booking')).toHaveTextContent('1')
  })

  it('ranks machines and spells out utilisation as a percentage', () => {
    seed([booking(), booking({ id: 'bk-2', machineId: 'laser-a', endMinute: at(0, 19) })])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    const rows = within(tableFor('Machine utilisation')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Filament printer')
    expect(rows[0]).toHaveTextContent('3 h')
    expect(rows[1]).toHaveTextContent('Big laser')
  })

  it('says a machine is not bookable rather than dividing by its zero hours', () => {
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    const row = screen.getByRole('row', { name: /MIG welder/ })
    expect(within(row).getByText('Out of service')).toBeInTheDocument()
    expect(row).toHaveTextContent('Not bookable')
  })

  it('shows the heatmap as a table whose cells read out in words', () => {
    seed([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    expect(screen.getByRole('table', { name: 'Occupancy by day and hour' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Monday 09:00, closed' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /^Monday 18:00, \d+% booked$/ })).toBeInTheDocument()
  })

  it('ranks the busiest hours first', () => {
    seed([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    const rows = within(tableFor('Peak hours')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Monday 18:00')
    expect(rows[0]).toHaveTextContent('1 h')
  })

  it('suggests the quietest bookable slots', () => {
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    const rows = within(tableFor('Quiet slots')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('Mon 17:00 – 17:30')
    expect(rows[0]).toHaveTextContent('7 of 7')
  })

  it('leads the member board with the heaviest user and marks who you are', () => {
    signInAs('m-pia')
    seed([
      booking({ id: 'bk-1', memberId: 'm-pia', startMinute: at(0, 18), endMinute: at(0, 20) }),
      booking({
        id: 'bk-2',
        memberId: 'm-ilra',
        machineId: 'laser-a',
        startMinute: at(0, 18),
        endMinute: at(0, 19),
      }),
    ])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    const rows = within(tableFor('Member leaderboard')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Pia Lindqvist')
    expect(rows[0]).toHaveTextContent('2 h of 4 h')
    expect(rows[0]).toHaveTextContent('67%')
    expect(within(rows[0]).getByText('You')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('Ilra Diagana')
  })

  it('hides week-over-week figures until a baseline exists', () => {
    seed([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    expect(screen.getByText('No baseline saved yet')).toBeInTheDocument()
    expect(screen.queryByText('No change')).not.toBeInTheDocument()
    expect(screen.queryByText('Up')).not.toBeInTheDocument()
  })

  it('saves the current week as a baseline and then compares against it', async () => {
    seed([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    await userEvent.click(screen.getByRole('button', { name: 'Save this week as the baseline' }))

    expect(screen.getByText('Comparing with 1 saved booking')).toBeInTheDocument()
    expect(screen.getAllByText('No change').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Level with the baseline week').length).toBeGreaterThan(0)
  })

  it('reports growth in words when this week beats the baseline', () => {
    seedBaseline([booking({ id: 'bk-old', endMinute: at(0, 19) })])
    seed([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    expect(screen.getByText('2 h more than the baseline week')).toBeInTheDocument()
    expect(screen.getAllByText('Up').length).toBeGreaterThan(0)
  })

  it('reports a fall when the baseline was the busier week', () => {
    seedBaseline([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    expect(screen.getByText('3 h less than the baseline week')).toBeInTheDocument()
    expect(screen.getAllByText('Down').length).toBeGreaterThan(0)
  })

  it('clears the baseline again, and cannot clear one that is not there', async () => {
    seedBaseline([booking()])
    renderWithProviders(<ReportsPage />, { route: '/reports' })

    const clear = screen.getByRole('button', { name: 'Clear baseline' })
    expect(clear).toBeEnabled()

    await userEvent.click(clear)

    expect(screen.getByText('No baseline saved yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear baseline' })).toBeDisabled()
  })
})
