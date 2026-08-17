import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { App } from '@/App'
import { configureLatency, resetIdCounter } from '@/lib/api'

function renderApp(route = '/') {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  configureLatency(0)
  resetIdCounter()
})

afterEach(() => {
  configureLatency()
})

const sections = () => screen.getByRole('navigation', { name: 'Sections' })

describe('App', () => {
  it('opens on the board', () => {
    renderApp()

    expect(screen.getByRole('heading', { name: 'Booking board' })).toBeInTheDocument()
  })

  it('marks the active section', () => {
    renderApp()

    expect(within(sections()).getByRole('link', { name: 'Board' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('navigates between sections', async () => {
    renderApp()

    await userEvent.click(within(sections()).getByRole('link', { name: 'Usage' }))
    expect(screen.getByRole('heading', { name: 'Usage' })).toBeInTheDocument()

    await userEvent.click(within(sections()).getByRole('link', { name: 'My bookings' }))
    expect(screen.getByRole('heading', { name: 'No bookings yet' })).toBeInTheDocument()
  })

  it('redirects an unknown route back to the board', () => {
    renderApp('/nope')

    expect(screen.getByRole('heading', { name: 'Booking board' })).toBeInTheDocument()
  })

  it('offers a skip link to the main region', () => {
    renderApp()

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })

  it('carries a booking made on the board through to My bookings', async () => {
    renderApp()

    await userEvent.click(
      screen.getByRole('button', { name: 'Big laser at 17:00, free' }),
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm booking' }))

    await userEvent.click(within(sections()).getByRole('link', { name: 'My bookings' }))

    expect(screen.getByRole('row', { name: /Big laser/ })).toBeInTheDocument()
    expect(screen.getByText('1 booked, 1 h of machine time this week.')).toBeInTheDocument()
  })

  it('updates the header allowance as bookings are made', async () => {
    renderApp()

    expect(screen.getByText('15 h left of 15 h')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Big laser at 17:00, free' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm booking' }))

    expect(await screen.findByText('14 h left of 15 h')).toBeInTheDocument()
  })

  it('switches the signed-in member from the header', async () => {
    renderApp()

    await userEvent.selectOptions(screen.getByRole('combobox'), 'm-pia')

    expect(screen.getByText('4 h left of 4 h')).toBeInTheDocument()
  })
})
