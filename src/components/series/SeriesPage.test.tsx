import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SeriesPage } from '@/components/series/SeriesPage'
import { configureLatency } from '@/lib/api'
import type { SeriesDefinition } from '@/lib/recurrence'
import { weekMinute } from '@/lib/weektime'
import { SeriesProvider } from '@/state/SeriesProvider'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const BOOKINGS_KEY = 'benchclock:bookings:v1'
const SERIES_KEY = 'benchclock:series:v1'

const series = (over: Partial<SeriesDefinition> = {}): SeriesDefinition => ({
  id: 'sr-0001',
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  repeatCount: 3,
  mode: 'skip-refused',
  createdAt: 1,
  ...over,
})

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

function seed(definitions: SeriesDefinition[], bookings: Booking[] = []) {
  window.localStorage.setItem(SERIES_KEY, JSON.stringify(definitions))
  window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings))
}

function renderPage() {
  return renderWithProviders(
    <SeriesProvider>
      <SeriesPage />
    </SeriesProvider>,
    { route: '/series' },
  )
}

const storedBookings = (): Booking[] =>
  JSON.parse(window.localStorage.getItem(BOOKINGS_KEY) ?? '[]') as Booking[]

beforeEach(() => {
  configureLatency(0)
})

afterEach(() => {
  configureLatency()
})

describe('SeriesPage', () => {
  it('points the member at the board when they have no series', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'No repeating bookings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the board' })).toHaveAttribute('href', '/')
  })

  it('lists a series with its slot, weeks, and total time', () => {
    seed([series({ note: 'Lamp base' })])
    renderPage()

    const row = screen.getByRole('row', { name: /Big laser/ })
    expect(row).toHaveTextContent('Mon 18:00 – 19:00')
    expect(row).toHaveTextContent('3 weeks')
    expect(row).toHaveTextContent('3 h')
    expect(row).toHaveTextContent('Lamp base')
  })

  it('sums the machine time every series holds', () => {
    seed([
      series(),
      series({ id: 'sr-0002', startMinute: at(1, 18), endMinute: at(1, 19), repeatCount: 2 }),
    ])
    renderPage()

    expect(screen.getByText('2 series, 5 h of machine time booked ahead.')).toBeInTheDocument()
  })

  it('counts a single series in the singular', () => {
    seed([series({ repeatCount: 1 })])
    renderPage()

    expect(screen.getByText('1 series, 1 h of machine time booked ahead.')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Big laser/ })).toHaveTextContent('1 week')
  })

  it('leaves out series belonging to other members', () => {
    seed([series(), series({ id: 'sr-0002', memberId: 'm-pia', machineId: 'printer-b' })])
    renderPage()

    expect(screen.getByRole('row', { name: /Big laser/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Filament printer/ })).not.toBeInTheDocument()
  })

  it('follows the member who is signed in', () => {
    seed([series({ memberId: 'm-pia', machineId: 'printer-b' })])
    signInAs('m-pia')
    renderPage()

    expect(screen.getByRole('row', { name: /Filament printer/ })).toBeInTheDocument()
  })

  it('orders series by the slot they repeat on', () => {
    seed([
      series({ id: 'sr-late', startMinute: at(2, 20), endMinute: at(2, 21) }),
      series({ id: 'sr-early', startMinute: at(0, 18), endMinute: at(0, 19) }),
    ])
    renderPage()

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Mon 18:00')
    expect(rows[1]).toHaveTextContent('Wed 20:00')
  })

  it('spells out what happens to a week that is already taken', () => {
    seed([series(), series({ id: 'sr-0002', startMinute: at(1, 18), endMinute: at(1, 19), mode: 'all-or-nothing' })])
    renderPage()

    expect(screen.getByText('Skips taken weeks')).toBeInTheDocument()
    expect(screen.getByText('All weeks or none')).toBeInTheDocument()
  })

  it('says in words whether this week is on the board', () => {
    seed([series(), series({ id: 'sr-0002', startMinute: at(1, 18), endMinute: at(1, 19) })], [
      booking(),
    ])
    renderPage()

    expect(screen.getByText('On the board this week')).toBeInTheDocument()
    expect(screen.getByText('Not on the board this week')).toBeInTheDocument()
  })

  it('never expands a series past the maximum term', () => {
    seed([series({ repeatCount: 500 })])
    renderPage()

    expect(screen.getByRole('row', { name: /Big laser/ })).toHaveTextContent('12 weeks')
  })

  it('names a machine it does not recognise', () => {
    seed([series({ machineId: 'gone-machine' })])
    renderPage()

    expect(screen.getByRole('row', { name: /Unknown machine/ })).toBeInTheDocument()
  })

  it('asks before cancelling and can be dismissed', async () => {
    seed([series()])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Cancel this series?')
    expect(dialog).toHaveAccessibleDescription('Big laser · Mon 18:00')
    expect(within(dialog).getByText(/3 weeks of machine time go back/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Big laser/ })).toBeInTheDocument()
  })

  it('cancels the whole series once confirmed', async () => {
    seed([series()])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel series' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'No repeating bookings' })).toBeInTheDocument(),
    )
  })

  it('takes this week’s booking off the board with the series', async () => {
    seed([series()], [booking(), booking({ id: 'bk-other', startMinute: at(3, 18), endMinute: at(3, 19) })])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/This week’s booking is cancelled too/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel series' }))

    await waitFor(() => expect(storedBookings()).toHaveLength(1))
    expect(storedBookings()[0].id).toBe('bk-other')
  })

  it('leaves the board alone when the series has no booking this week', async () => {
    seed([series()], [booking({ id: 'bk-other', startMinute: at(3, 18), endMinute: at(3, 19) })])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/This week’s booking is cancelled too/)).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel series' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'No repeating bookings' })).toBeInTheDocument(),
    )
    expect(storedBookings()).toHaveLength(1)
  })

  it('announces the cancellation', async () => {
    seed([series()])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel series' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Series cancelled')
  })

  it('only cancels the series the member picked', async () => {
    seed([series(), series({ id: 'sr-0002', startMinute: at(1, 18), endMinute: at(1, 19) })])
    renderPage()

    const row = screen.getByRole('row', { name: /Mon 18:00/ })
    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel series' }))

    await waitFor(() =>
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2),
    )
    expect(screen.getByText('1 series, 3 h of machine time booked ahead.')).toBeInTheDocument()
  })
})
