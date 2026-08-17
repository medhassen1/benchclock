import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { MaintenancePage } from '@/components/maintenance/MaintenancePage'
import { weekMinute } from '@/lib/weektime'
import { MaintenanceProvider } from '@/state/MaintenanceProvider'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

function seedBookings(bookings: Booking[]) {
  window.localStorage.setItem('benchclock:bookings:v1', JSON.stringify(bookings))
}

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-0001',
  machineId: 'cnc-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 20),
  note: '',
  createdAt: 1,
  ...over,
})

/** The page needs the maintenance store on top of the usual provider stack. */
function renderPage(ui: ReactElement = <MaintenancePage />) {
  return renderWithProviders(<MaintenanceProvider>{ui}</MaintenanceProvider>, {
    route: '/maintenance',
  })
}

const row = (name: RegExp) => screen.getByRole('row', { name })

async function openRecordDialog(machine: RegExp) {
  await userEvent.click(within(row(machine)).getByRole('button', { name: 'Record service' }))
  return screen.findByRole('dialog')
}

describe('MaintenancePage', () => {
  it('lists every machine in the workshop', () => {
    renderPage()

    // Eight machines plus the header row.
    expect(within(screen.getAllByRole('table')[0]).getAllByRole('row')).toHaveLength(9)
  })

  it('says in words which machines are overdue, not only in colour', () => {
    renderPage()

    const overdue = row(/Metal lathe/)
    expect(within(overdue).getByText('Overdue')).toBeInTheDocument()
    // Exactly at the interval counts as due, with nothing owed yet.
    expect(within(overdue).getByText('Due now')).toBeInTheDocument()
  })

  it('states how far past due a machine has run', () => {
    renderPage()

    expect(within(row(/MIG welder/)).getByText('1 h past due')).toBeInTheDocument()
  })

  it('warns about a machine approaching its service', () => {
    renderPage()

    const soon = row(/Big laser/)
    expect(within(soon).getByText('Due soon')).toBeInTheDocument()
    expect(within(soon).getByText('2 h of run time left')).toBeInTheDocument()
  })

  it('sorts overdue machines to the top', () => {
    renderPage()

    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Overdue')
    expect(rows[1]).toHaveTextContent('Overdue')
    expect(rows[2]).toHaveTextContent('Due soon')
  })

  it('summarises the overdue machines above the table', () => {
    renderPage()

    const summary = screen.getByRole('status')
    expect(summary).toHaveTextContent('2 machines overdue for a service')
    expect(summary).toHaveTextContent('Metal lathe')
    expect(summary).toHaveTextContent('MIG welder')
  })

  it('says a machine without a service interval is not tracked', () => {
    renderPage()

    const untracked = row(/Desktop laser/)
    expect(within(untracked).getByText('Not tracked')).toBeInTheDocument()
    expect(within(untracked).getByText('No service interval set')).toBeInTheDocument()
  })

  it('shows the next maintenance window for a machine', () => {
    renderPage()

    const laser = row(/Big laser/)
    expect(laser).toHaveTextContent('Tue 17:00 – 18:30')
    expect(laser).toHaveTextContent('Lens clean and mirror alignment')
  })

  it('says when a machine has no maintenance scheduled', () => {
    renderPage()

    expect(within(row(/Filament printer/)).getByText('None scheduled')).toBeInTheDocument()
  })

  it('counts this week\'s bookings towards the service cycle', () => {
    seedBookings([booking()])
    renderPage()

    // The CNC router carries 10 h, its interval is 30 h, and two more hours
    // are booked this week.
    expect(within(row(/CNC router/)).getByText('18 h of run time left')).toBeInTheDocument()
  })

  it('groups the week\'s downtime by day', () => {
    renderPage()

    const monday = screen.getByRole('list', { name: 'Monday maintenance' })
    expect(within(monday).getAllByRole('listitem')).toHaveLength(1)
    expect(monday).toHaveTextContent('20:00 – 21:00')
    expect(monday).toHaveTextContent('Overlocker')
    expect(screen.queryByRole('list', { name: 'Friday maintenance' })).not.toBeInTheDocument()
  })

  it('starts with an empty service log', () => {
    renderPage()

    expect(screen.getByText(/No services recorded yet/)).toBeInTheDocument()
  })
})

describe('MaintenancePage as a keyholder', () => {
  it('records a service and clears the machine\'s overdue flag', async () => {
    renderPage()

    const dialog = await openRecordDialog(/Metal lathe/)
    await userEvent.type(
      within(dialog).getByLabelText('What was done'),
      'Stripped the chuck and re-oiled the ways',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record service' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const lathe = row(/Metal lathe/)
    expect(within(lathe).getByText('Up to date')).toBeInTheDocument()
    expect(within(lathe).getByText('40 h of run time left')).toBeInTheDocument()
  })

  it('adds the service to the log, signed and dated', async () => {
    renderPage()

    const dialog = await openRecordDialog(/Metal lathe/)
    await userEvent.type(within(dialog).getByLabelText('What was done'), 'Re-oiled the ways')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record service' }))

    const log = await screen.findByRole('list', { name: 'Completed services' })
    expect(log).toHaveTextContent('Re-oiled the ways')
    expect(log).toHaveTextContent('Signed off by Ilra Diagana')
    expect(log).toHaveTextContent('Mon 17:00')
  })

  it('announces the recorded service in a toast', async () => {
    renderPage()

    const dialog = await openRecordDialog(/MIG welder/)
    await userEvent.type(within(dialog).getByLabelText('What was done'), 'New wire feed motor')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record service' }))

    expect(await screen.findByText('MIG welder serviced')).toBeInTheDocument()
  })

  it('records the kind of work chosen', async () => {
    renderPage()

    const dialog = await openRecordDialog(/MIG welder/)
    await userEvent.selectOptions(within(dialog).getByLabelText('Work done'), 'repair')
    await userEvent.type(within(dialog).getByLabelText('What was done'), 'New wire feed motor')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record service' }))

    const log = await screen.findByRole('list', { name: 'Completed services' })
    expect(within(log).getByText('Repair')).toBeInTheDocument()
  })

  it('will not record a service with no note', async () => {
    renderPage()

    const dialog = await openRecordDialog(/Metal lathe/)

    expect(within(dialog).getByRole('button', { name: 'Record service' })).toBeDisabled()
    expect(
      within(dialog).getByText('Add a note describing the work before recording it.'),
    ).toBeInTheDocument()
  })

  it('offers only the times that day is open', async () => {
    renderPage()

    const dialog = await openRecordDialog(/Metal lathe/)
    const time = within(dialog).getByLabelText('Time')

    // Monday opens at 17:00 and closes at 22:00.
    expect(within(time).getAllByRole('option')[0]).toHaveTextContent('17:00')
    await userEvent.selectOptions(within(dialog).getByLabelText('Day'), '5')
    expect(within(time).getAllByRole('option')[0]).toHaveTextContent('09:00')
  })

  it('closes the dialog without recording anything when cancelled', async () => {
    renderPage()

    const dialog = await openRecordDialog(/Metal lathe/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText(/No services recorded yet/)).toBeInTheDocument()
  })

  it('cancels a scheduled downtime window', async () => {
    renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: /Cancel Overlocker downtime on Monday at 20:00/ }),
    )

    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Monday maintenance' })).not.toBeInTheDocument(),
    )
    expect(within(row(/Overlocker/)).getByText('None scheduled')).toBeInTheDocument()
  })
})

describe('MaintenancePage as a member without keys', () => {
  it('explains why a regular member cannot record a service', () => {
    signInAs('m-tomas')
    renderPage()

    expect(screen.getByText(/Only keyholders can record a service/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record service' })).not.toBeInTheDocument()
    expect(within(row(/Metal lathe/)).getByText('Keyholders only')).toBeInTheDocument()
  })

  it('does not offer a casual member the record or cancel controls', () => {
    signInAs('m-pia')
    renderPage()

    expect(screen.queryByRole('button', { name: 'Record service' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /downtime on/ })).not.toBeInTheDocument()
  })

  it('still shows a regular member what is overdue and what is scheduled', () => {
    signInAs('m-tomas')
    renderPage()

    expect(within(row(/Metal lathe/)).getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Monday maintenance' })).toBeInTheDocument()
  })
})
