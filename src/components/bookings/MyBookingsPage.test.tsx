import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MyBookingsPage } from '@/components/bookings/MyBookingsPage'
import { configureLatency } from '@/lib/api'
import { weekMinute } from '@/lib/weektime'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

function seed(bookings: Booking[]) {
  window.localStorage.setItem('benchclock:bookings:v1', JSON.stringify(bookings))
}

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-0001',
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  createdAt: 1,
  ...over,
})

beforeEach(() => {
  configureLatency(0)
})

afterEach(() => {
  configureLatency()
})

describe('MyBookingsPage', () => {
  it('invites the member to the board when they have nothing booked', () => {
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    expect(screen.getByRole('heading', { name: 'No bookings yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the board' })).toHaveAttribute('href', '/')
  })

  it('lists the signed-in member\'s bookings with a weekly total', () => {
    seed([
      booking({ id: 'bk-1' }),
      booking({ id: 'bk-2', startMinute: at(1, 18), endMinute: at(1, 20) }),
    ])
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    expect(screen.getByText('2 booked, 3 h of machine time this week.')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('leaves out other members\' bookings', () => {
    seed([booking({ id: 'bk-1' }), booking({ id: 'bk-2', memberId: 'm-pia' })])
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    expect(screen.getByText('1 booked, 1 h of machine time this week.')).toBeInTheDocument()
  })

  it('shows each booking with machine, time, and length', () => {
    seed([booking({ note: 'Lamp base' })])
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    const row = screen.getByRole('row', { name: /Big laser/ })
    expect(row).toHaveTextContent('Mon 18:00 – 19:00')
    expect(row).toHaveTextContent('1 h')
    expect(row).toHaveTextContent('Lamp base')
  })

  it('orders bookings by start time', () => {
    seed([
      booking({ id: 'bk-late', startMinute: at(2, 20), endMinute: at(2, 21) }),
      booking({ id: 'bk-early', startMinute: at(0, 18), endMinute: at(0, 19) }),
    ])
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Mon 18:00')
    expect(rows[1]).toHaveTextContent('Wed 20:00')
  })

  it('asks before cancelling and can be dismissed', async () => {
    seed([booking()])
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Cancel this booking?')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Big laser/ })).toBeInTheDocument()
  })

  it('removes the booking once confirmed', async () => {
    seed([booking()])
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'No bookings yet' })).toBeInTheDocument(),
    )
  })

  it('follows the member who is signed in', () => {
    seed([booking({ memberId: 'm-pia', machineId: 'printer-b' })])
    signInAs('m-pia')
    renderWithProviders(<MyBookingsPage />, { route: '/bookings' })

    expect(screen.getByRole('row', { name: /Filament printer/ })).toBeInTheDocument()
  })
})
