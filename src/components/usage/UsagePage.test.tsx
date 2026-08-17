import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { UsagePage } from '@/components/usage/UsagePage'
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

describe('UsagePage', () => {
  it('reports an untouched allowance', () => {
    renderWithProviders(<UsagePage />, { route: '/usage' })

    const card = screen.getByRole('group', { name: 'Your allowance' })
    expect(card).toHaveTextContent('0 m of 15 h')
    expect(screen.getByRole('meter', { name: 'Allowance used' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
  })

  it('counts only the signed-in member towards their allowance', () => {
    seed([
      booking({ id: 'bk-1' }),
      booking({ id: 'bk-2', memberId: 'm-pia', machineId: 'printer-b' }),
    ])
    renderWithProviders(<UsagePage />, { route: '/usage' })

    expect(screen.getByRole('group', { name: 'Your allowance' })).toHaveTextContent('1 h of 15 h')
  })

  it('states remaining time in words, not colour alone', () => {
    seed([booking()])
    renderWithProviders(<UsagePage />, { route: '/usage' })

    expect(screen.getByText('14 h still bookable')).toBeInTheDocument()
  })

  it('says when the allowance is used up', () => {
    signInAs('m-pia')
    seed([
      booking({ memberId: 'm-pia', machineId: 'printer-b', startMinute: at(5, 9), endMinute: at(5, 13) }),
    ])
    renderWithProviders(<UsagePage />, { route: '/usage' })

    expect(screen.getByText('Allowance used up')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Allowance used' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
  })

  it('lists machine demand across the whole workshop, busiest first', () => {
    seed([
      booking({ id: 'bk-1', machineId: 'printer-b', startMinute: at(0, 18), endMinute: at(0, 21) }),
      booking({ id: 'bk-2', machineId: 'laser-a' }),
    ])
    renderWithProviders(<UsagePage />, { route: '/usage' })

    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Filament printer')
    expect(rows[0]).toHaveTextContent('3 h')
    expect(rows[1]).toHaveTextContent('Big laser')
  })

  it('flags machines that are out of service', () => {
    renderWithProviders(<UsagePage />, { route: '/usage' })

    const row = screen.getByRole('row', { name: /MIG welder/ })
    expect(within(row).getByText('Out of service')).toBeInTheDocument()
  })

  it('shows every member and marks which one is you', () => {
    renderWithProviders(<UsagePage />, { route: '/usage' })

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(list).getByText('You')).toBeInTheDocument()
  })

  it('lists the signed-in member\'s sign-offs', () => {
    signInAs('m-pia')
    renderWithProviders(<UsagePage />, { route: '/usage' })

    expect(screen.getByText(/none yet/)).toBeInTheDocument()
  })
})
