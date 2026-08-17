import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WaitlistPage } from '@/components/waitlist/WaitlistPage'
import { configureLatency } from '@/lib/api'
import type { WaitlistEntry } from '@/lib/waitlist'
import { weekMinute } from '@/lib/weektime'
import { WaitlistProvider } from '@/state/WaitlistProvider'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

function seedBookings(bookings: Partial<Booking>[]) {
  window.localStorage.setItem(
    'benchclock:bookings:v1',
    JSON.stringify(
      bookings.map((over, index) => ({
        id: `bk-${index + 1}`,
        machineId: 'laser-a',
        memberId: 'm-tomas',
        startMinute: at(0, 18),
        endMinute: at(0, 19),
        note: '',
        createdAt: index + 1,
        ...over,
      })),
    ),
  )
}

function seedQueue(entries: Partial<WaitlistEntry>[]) {
  window.localStorage.setItem(
    'benchclock:waitlist:v1',
    JSON.stringify(
      entries.map((over, index) => ({
        id: `wl-${index + 1}`,
        machineId: 'laser-a',
        memberId: 'm-ilra',
        startMinute: at(0, 18),
        endMinute: at(0, 19),
        note: '',
        joinedAt: index + 1,
        ...over,
      })),
    ),
  )
}

const renderPage = () =>
  renderWithProviders(
    <WaitlistProvider>
      <WaitlistPage />
    </WaitlistProvider>,
    { route: '/waitlist' },
  )

beforeEach(() => {
  configureLatency(0)
})

afterEach(() => {
  configureLatency()
})

describe('WaitlistPage', () => {
  it('invites the member to the board when they are waiting for nothing', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: 'You are not waiting for anything' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the board' })).toHaveAttribute('href', '/')
  })

  it('lists every slot the member is waiting for', () => {
    seedQueue([
      { memberId: 'm-ilra' },
      { memberId: 'm-ilra', machineId: 'printer-b', startMinute: at(1, 18), endMinute: at(1, 20) },
    ])
    renderPage()

    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('2 slots, 2 of them next in line.')).toBeInTheDocument()
  })

  it('leaves out the queues other members are in', () => {
    seedQueue([{ memberId: 'm-ilra' }, { memberId: 'm-tomas', machineId: 'printer-b' }])
    renderPage()

    expect(screen.getByText('1 slot, 1 of them next in line.')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Filament printer/ })).not.toBeInTheDocument()
  })

  it('shows the machine, the time, and the length of each slot', () => {
    seedQueue([{ memberId: 'm-ilra' }])
    renderPage()

    const row = screen.getByRole('row', { name: /Big laser/ })
    expect(row).toHaveTextContent('Mon 18:00 – 19:00')
    expect(row).toHaveTextContent('1 h')
  })

  it('states the position in words, with the queue length', () => {
    seedQueue([
      { memberId: 'm-nour' },
      { memberId: 'm-pia' },
      { memberId: 'm-ilra' },
    ])
    renderPage()

    const row = screen.getByRole('row', { name: /Big laser/ })
    expect(row).toHaveTextContent('Position 3 of 3')
    expect(row).not.toHaveTextContent('Next in line')
  })

  it('marks a place at the head of the queue in text', () => {
    seedQueue([{ memberId: 'm-ilra' }, { memberId: 'm-nour' }])
    renderPage()

    const row = screen.getByRole('row', { name: /Big laser/ })
    expect(row).toHaveTextContent('Position 1 of 2')
    expect(row).toHaveTextContent('Next in line')
  })

  it('names who is holding the slot, or says it is free', () => {
    seedBookings([{}])
    seedQueue([
      { memberId: 'm-ilra' },
      { memberId: 'm-ilra', machineId: 'printer-b', startMinute: at(1, 18), endMinute: at(1, 19) },
    ])
    renderPage()

    expect(screen.getByRole('row', { name: /Big laser/ })).toHaveTextContent('Tomas Berg')
    expect(screen.getByRole('row', { name: /Filament printer/ })).toHaveTextContent('Free now')
  })

  it('orders the slots by when they start', () => {
    seedQueue([
      { memberId: 'm-ilra', machineId: 'printer-b', startMinute: at(3, 18), endMinute: at(3, 19) },
      { memberId: 'm-ilra' },
    ])
    renderPage()

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Mon 18:00')
    expect(rows[1]).toHaveTextContent('Thu 18:00')
  })

  it('asks before giving a place up, and can be dismissed', async () => {
    seedQueue([{ memberId: 'm-ilra' }])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Give up your place?')
    expect(dialog).toHaveTextContent('Big laser · Mon 18:00')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay in the queue' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Big laser/ })).toBeInTheDocument()
  })

  it('drops the place once confirmed', async () => {
    seedQueue([{ memberId: 'm-ilra' }])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave the waitlist' }))

    expect(
      screen.getByRole('heading', { name: 'You are not waiting for anything' }),
    ).toBeInTheDocument()
  })

  it('gives up only the slot that was confirmed', async () => {
    seedQueue([
      { memberId: 'm-nour', machineId: 'printer-b', startMinute: at(1, 18), endMinute: at(1, 19) },
      { memberId: 'm-ilra' },
      { memberId: 'm-ilra', machineId: 'printer-b', startMinute: at(1, 18), endMinute: at(1, 19) },
    ])
    renderPage()

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Leave' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave the waitlist' }))

    expect(screen.queryByRole('row', { name: /Big laser/ })).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Filament printer/ })).toHaveTextContent(
      'Position 2 of 2',
    )
    expect(screen.getByText('1 slot, 0 of them next in line.')).toBeInTheDocument()
  })

  it('follows the member who is signed in', () => {
    seedQueue([{ memberId: 'm-pia', machineId: 'printer-b' }])
    signInAs('m-pia')
    renderPage()

    expect(screen.getByRole('row', { name: /Filament printer/ })).toBeInTheDocument()
  })
})
