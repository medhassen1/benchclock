import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { StockPage } from '@/components/stock/StockPage'
import type { StockLevels } from '@/lib/stock'
import { weekMinute } from '@/lib/weektime'
import { StockProvider } from '@/state/StockProvider'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const seedStock = (levels: StockLevels) =>
  window.localStorage.setItem('benchclock:stock:v1', JSON.stringify(levels))

const seedBookings = (bookings: Booking[]) =>
  window.localStorage.setItem('benchclock:bookings:v1', JSON.stringify(bookings))

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-1',
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 20),
  note: '',
  createdAt: 1,
  ...over,
})

function renderPage() {
  return renderWithProviders(
    <StockProvider>
      <StockPage />
    </StockProvider>,
    { route: '/stock' },
  )
}

const row = (name: RegExp | string) => screen.getByRole('row', { name })

describe('StockPage', () => {
  it('lists every consumable with its level and reorder point', () => {
    renderPage()

    const plywood = row(/Plywood 3 mm/)
    expect(plywood).toHaveTextContent('24 sheets')
    expect(plywood).toHaveTextContent('6 sheets')
    expect(plywood).toHaveTextContent('Laser cutter, CNC router')
  })

  it('warns about low stock in text, not colour alone', () => {
    // MIG welding wire opens on exactly its 3 kg reorder threshold.
    renderPage()

    expect(within(row(/MIG welding wire/)).getByText('Low stock — order more')).toBeInTheDocument()
    expect(within(row(/Plywood 3 mm/)).getByText('In stock')).toBeInTheDocument()
  })

  it('calls an empty shelf out of stock', () => {
    seedStock({ 'ply-3mm': 0 })
    renderPage()

    expect(within(row(/Plywood 3 mm/)).getByText('Out of stock — order now')).toBeInTheDocument()
  })

  it('counts what needs ordering in the summary', () => {
    renderPage()

    const summary = screen.getByRole('group', { name: 'Stock summary' })
    expect(summary).toHaveTextContent('1 item needs ordering: MIG welding wire')
  })

  it('says so when nothing needs ordering', () => {
    seedStock({ 'welding-wire': 10 })
    renderPage()

    expect(screen.getByText('Every item is above its reorder level')).toBeInTheDocument()
  })

  it('projects the shelf forward over the booked jobs', () => {
    seedBookings([booking()])
    renderPage()

    // Two hours on a laser: one sheet of plywood an hour.
    expect(row(/Plywood 3 mm/)).toHaveTextContent('22 sheets')
    expect(row(/Acrylic 3 mm/)).toHaveTextContent('8 sheets')
  })

  it('names the shortfall when the booked jobs outrun the shelf', () => {
    seedStock({ 'ply-3mm': 1 })
    seedBookings([booking()])
    renderPage()

    expect(within(row(/Plywood 3 mm/)).getByText('1 sheet short')).toBeInTheDocument()
  })

  it('restocks an item from zero', async () => {
    const user = userEvent.setup()
    seedStock({ 'ply-3mm': 0 })
    renderPage()

    await user.type(screen.getByRole('spinbutton', { name: 'sheets of Plywood 3 mm to add' }), '12')
    await user.click(screen.getByRole('button', { name: 'Restock Plywood 3 mm' }))

    const plywood = row(/Plywood 3 mm/)
    expect(plywood).toHaveTextContent('12 sheets')
    expect(within(plywood).getByText('In stock')).toBeInTheDocument()
    expect(await screen.findByText('Restocked Plywood 3 mm')).toBeInTheDocument()
  })

  it('adds to a shelf that is already stocked and clears the box', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = screen.getByRole('spinbutton', { name: 'kilograms of MIG welding wire to add' })
    await user.type(input, '5')
    await user.click(screen.getByRole('button', { name: 'Restock MIG welding wire' }))

    expect(row(/MIG welding wire/)).toHaveTextContent('8 kilograms')
    expect(input).toHaveValue(null)
  })

  it('asks for an amount rather than restocking nothing', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Restock Plywood 3 mm' }))

    expect(await screen.findByText('Enter how many sheets to add')).toBeInTheDocument()
    expect(row(/Plywood 3 mm/)).toHaveTextContent('24 sheets')
  })

  it('refuses a negative restock', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByRole('spinbutton', { name: 'sheets of Plywood 3 mm to add' }), '-4')
    await user.click(screen.getByRole('button', { name: 'Restock Plywood 3 mm' }))

    expect(row(/Plywood 3 mm/)).toHaveTextContent('24 sheets')
  })

  it('falls back to the opening quantities when the stored shelf is nonsense', () => {
    window.localStorage.setItem('benchclock:stock:v1', JSON.stringify({ 'ply-3mm': 'lots' }))
    renderPage()

    expect(row(/Plywood 3 mm/)).toHaveTextContent('24 sheets')
  })
})
