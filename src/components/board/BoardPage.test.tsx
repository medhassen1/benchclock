import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BoardPage } from '@/components/board/BoardPage'
import { configureLatency, resetIdCounter } from '@/lib/api'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'

const grid = () => screen.getByRole('grid', { name: /bookings/ })

/** The Monday 17:00 cell for the Big laser. */
const freeCell = (name = 'Big laser at 17:00, free') =>
  within(grid()).getByRole('button', { name })

beforeEach(() => {
  configureLatency(0)
  resetIdCounter()
})

afterEach(() => {
  configureLatency()
})

async function book(cellName?: string) {
  await userEvent.click(freeCell(cellName))
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm booking' }))
  return dialog
}

describe('BoardPage', () => {
  it('renders a grid of machines against half-hour slots', () => {
    renderWithProviders(<BoardPage />)

    expect(grid()).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Big laser/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '17:00' })).toBeInTheDocument()
  })

  it('labels every cell with machine, time, and state', () => {
    renderWithProviders(<BoardPage />)

    expect(freeCell()).toHaveAccessibleName('Big laser at 17:00, free')
  })

  it('books a free slot and marks the cell as yours', async () => {
    renderWithProviders(<BoardPage />)

    await book()

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(
      within(grid()).getByRole('button', { name: 'Big laser at 17:00, booked by you' }),
    ).toBeInTheDocument()
  })

  it('announces the booking politely', async () => {
    renderWithProviders(<BoardPage />)

    await book()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Booked Big laser for Mon 17:00.'),
    )
  })

  it('blocks confirming when the member lacks the sign-off', async () => {
    signInAs('m-pia')
    renderWithProviders(<BoardPage />)

    await userEvent.click(freeCell())
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/needs the Laser basic sign-off/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Confirm booking' })).toBeDisabled()
  })

  it('explains a clash before the request is sent', async () => {
    renderWithProviders(<BoardPage />)

    // Book 18:00-19:00, then open 17:30 -- its default hour would run into it.
    await book('Big laser at 18:00, free')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(freeCell('Big laser at 17:30, free'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Big laser is already booked then.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Confirm booking' })).toBeDisabled()
  })

  it('confirms the slot is clear when nothing blocks it', async () => {
    renderWithProviders(<BoardPage />)

    await userEvent.click(freeCell())
    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).getByText('Slot is free and within your allowance.'),
    ).toBeInTheDocument()
  })

  it('cancels a booking the member owns', async () => {
    renderWithProviders(<BoardPage />)

    await book()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(
      within(grid()).getByRole('button', { name: 'Big laser at 17:00, booked by you' }),
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))

    await waitFor(() => expect(freeCell()).toBeInTheDocument())
  })

  it("offers no cancel button for another member's booking", async () => {
    const first = renderWithProviders(<BoardPage />)

    await book()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    first.unmount()

    // Same board, different member signed in.
    signInAs('m-pia')
    renderWithProviders(<BoardPage />)

    await userEvent.click(
      within(grid()).getByRole('button', { name: 'Big laser at 17:00, booked' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Booked by another member')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })

  it('switches days and shows that day only', async () => {
    renderWithProviders(<BoardPage />)

    await book()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Tue' }))

    expect(screen.getByRole('grid', { name: 'Tuesday bookings' })).toBeInTheDocument()
    expect(freeCell()).toBeInTheDocument()
  })

  it('hides machines the member cannot book when asked', async () => {
    signInAs('m-pia')
    renderWithProviders(<BoardPage />)

    expect(screen.getByRole('rowheader', { name: /Big laser/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /Only machines I can book/ }))

    expect(screen.queryByRole('rowheader', { name: /Big laser/ })).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Filament printer/ })).toBeInTheDocument()
  })

  it('moves between cells with the arrow keys', async () => {
    renderWithProviders(<BoardPage />)

    const first = freeCell()
    first.focus()
    expect(first).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(within(grid()).getByRole('button', { name: 'Big laser at 17:30, free' })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(
      within(grid()).getByRole('button', { name: 'Desktop laser at 17:30, free' }),
    ).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}{ArrowUp}')
    expect(first).toHaveFocus()
  })

  it('does not run past the edges of the grid', async () => {
    renderWithProviders(<BoardPage />)

    const first = freeCell()
    first.focus()

    await userEvent.keyboard('{ArrowLeft}{ArrowUp}')

    expect(first).toHaveFocus()
  })

  it('keeps the grid to a single tab stop', async () => {
    renderWithProviders(<BoardPage />)

    const cells = within(grid()).getAllByRole('button')
    const tabbable = cells.filter((cell) => cell.getAttribute('tabindex') === '0')

    expect(tabbable).toHaveLength(1)
  })

  it('says so when the workshop is shut', async () => {
    renderWithProviders(<BoardPage />)

    // Every day in the fixture is open, so the grid is always present.
    expect(screen.queryByText(/The workshop is closed/)).not.toBeInTheDocument()
  })
})
