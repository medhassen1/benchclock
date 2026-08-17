import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { AuditLogPage } from '@/components/audit/AuditLogPage'
import { AUDIT_STORAGE_KEY, type AuditEntry } from '@/lib/audit'
import { AuditProvider } from '@/state/AuditProvider'
import { renderWithProviders } from '@/test/renderWithProviders'

/** 17 August 2026, 18:04 UTC. */
const MONDAY = 1_786_989_840_000
/** The following day, 00:30 UTC. */
const TUESDAY = 1_787_013_000_000

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'au-0001',
  actorId: 'm-ilra',
  action: 'booking-created',
  subject: 'laser-a',
  details: 'Mon 18:00 – 19:00',
  at: MONDAY,
  ...over,
})

function seed(entries: AuditEntry[]) {
  window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(entries))
}

const renderPage = (ui: ReactElement = <AuditLogPage />) =>
  renderWithProviders(<AuditProvider>{ui}</AuditProvider>, { route: '/audit' })

describe('AuditLogPage', () => {
  it('says so when nothing has been logged', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Audit log' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing has been logged yet/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('writes each entry as a sentence', () => {
    seed([entry()])
    renderPage()

    expect(
      screen.getByText('Ilra Diagana booked Big laser — Mon 18:00 – 19:00'),
    ).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Ilra Diagana booked Big laser/ })).toHaveTextContent(
      '18:04',
    )
  })

  it('groups entries under a heading per day, newest day first', () => {
    seed([
      entry({ id: 'au-0001', at: MONDAY }),
      entry({ id: 'au-0002', at: TUESDAY, action: 'booking-cancelled' }),
    ])
    renderPage()

    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Tuesday 18 August 2026',
      'Monday 17 August 2026',
    ])
  })

  it('orders entries within a day newest first', () => {
    seed([
      entry({ id: 'au-0001', subject: 'laser-a', at: MONDAY }),
      entry({ id: 'au-0002', subject: 'cnc-a', at: MONDAY + 60_000 }),
    ])
    renderPage()

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('CNC router')
    expect(rows[1]).toHaveTextContent('Big laser')
  })

  it('counts the entries on show', () => {
    seed([entry({ id: 'au-0001' }), entry({ id: 'au-0002' })])
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('2 events logged.')
  })

  it('filters by action through a labelled select', async () => {
    seed([
      entry({ id: 'au-0001', action: 'booking-created' }),
      entry({ id: 'au-0002', action: 'booking-cancelled', at: MONDAY + 60_000 }),
    ])
    renderPage()

    const filter = screen.getByLabelText('Action')
    await userEvent.selectOptions(filter, 'booking-cancelled')

    expect(screen.getByText(/cancelled a booking on Big laser/)).toBeInTheDocument()
    expect(screen.queryByText(/Ilra Diagana booked Big laser/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 events shown.')
  })

  it('says when a filter matches nothing, without losing the trail', async () => {
    seed([entry()])
    renderPage()

    await userEvent.selectOptions(screen.getByLabelText('Action'), 'member-switched')

    expect(screen.getByText('No events match that filter.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 of 1 events shown.')
  })

  it('goes back to everything when the filter is reset', async () => {
    seed([entry({ id: 'au-0001' }), entry({ id: 'au-0002', action: 'bookings-exported' })])
    renderPage()

    const filter = screen.getByLabelText('Action')
    await userEvent.selectOptions(filter, 'bookings-exported')
    await userEvent.selectOptions(filter, 'all')

    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('labels every entry with its action', () => {
    seed([
      entry({ id: 'au-0001', action: 'booking-created' }),
      entry({ id: 'au-0002', action: 'bookings-imported', subject: 'CSV', details: '3 rows' }),
    ])
    renderPage()

    expect(screen.getByRole('row', { name: /booked Big laser/ })).toHaveTextContent('Booked')
    expect(screen.getByRole('row', { name: /imported bookings from CSV/ })).toHaveTextContent(
      'Imported',
    )
  })

  it('asks before clearing the log and can be dismissed', async () => {
    seed([entry()])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Clear log' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Clear the audit log?')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('empties the log once clearing is confirmed', async () => {
    seed([entry()])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Clear log' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Clear log' })[0])

    expect(screen.getByText(/Nothing has been logged yet/)).toBeInTheDocument()
    expect(window.localStorage.getItem(AUDIT_STORAGE_KEY)).toBe('[]')
  })

  it('offers no clearing when there is nothing to clear', () => {
    renderPage()

    expect(screen.getByRole('button', { name: 'Clear log' })).toBeDisabled()
  })
})
