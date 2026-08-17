import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WaitlistPanel } from '@/components/waitlist/WaitlistPanel'
import { configureLatency } from '@/lib/api'
import type { WaitlistEntry } from '@/lib/waitlist'
import { weekMinute } from '@/lib/weektime'
import { WaitlistProvider } from '@/state/WaitlistProvider'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

/** Monday 18:00–19:00 on the big laser, which needs the laser sign-off. */
const SLOT = { machineId: 'laser-a', startMinute: at(0, 18), endMinute: at(0, 19) }

function seedBookings(bookings: Partial<Booking>[]) {
  window.localStorage.setItem(
    'benchclock:bookings:v1',
    JSON.stringify(
      bookings.map((over, index) => ({
        id: `bk-${index + 1}`,
        machineId: SLOT.machineId,
        memberId: 'm-tomas',
        startMinute: SLOT.startMinute,
        endMinute: SLOT.endMinute,
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
        machineId: SLOT.machineId,
        memberId: 'm-ilra',
        startMinute: SLOT.startMinute,
        endMinute: SLOT.endMinute,
        note: '',
        joinedAt: index + 1,
        ...over,
      })),
    ),
  )
}

const renderPanel = (slot = SLOT) =>
  renderWithProviders(
    <WaitlistProvider>
      <WaitlistPanel {...slot} />
    </WaitlistProvider>,
  )

const queue = () => within(screen.getByRole('region', { name: /Waitlist for/ })).getByRole('list')

beforeEach(() => {
  configureLatency(0)
  seedBookings([{}])
})

afterEach(() => {
  configureLatency()
})

describe('WaitlistPanel', () => {
  it('names the machine and the slot it is queueing for', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'Waitlist for Big laser' })).toBeInTheDocument()
    expect(screen.getByText(/Mon 18:00 – 19:00/)).toBeInTheDocument()
  })

  it('names the member who currently holds the slot', () => {
    renderPanel()

    expect(screen.getByText(/held by Tomas Berg/)).toBeInTheDocument()
  })

  it('says so when nobody is waiting', () => {
    renderPanel()

    expect(screen.getByText('Nobody is waiting for this slot yet.')).toBeInTheDocument()
    expect(screen.getByText('0 waiting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toBeInTheDocument()
  })

  it('points a member at the board when the slot is not held at all', () => {
    seedBookings([])
    renderPanel()

    expect(
      screen.getByText('This slot is free right now — book it on the board instead of waiting.'),
    ).toBeInTheDocument()
  })

  it('states every position in words, not just as a rank', () => {
    seedQueue([{ memberId: 'm-nour' }, { memberId: 'm-ilra' }, { memberId: 'm-pia' }])
    renderPanel()

    const rows = within(queue()).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Position 1 of 3')
    expect(rows[1]).toHaveTextContent('Position 2 of 3')
    expect(rows[2]).toHaveTextContent('Position 3 of 3')
    expect(screen.getByText('3 waiting')).toBeInTheDocument()
  })

  it('orders the queue by who joined first', () => {
    seedQueue([
      { memberId: 'm-nour', joinedAt: 8 },
      { memberId: 'm-pia', joinedAt: 3 },
    ])
    renderPanel()

    const rows = within(queue()).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Pia Lindqvist')
    expect(rows[1]).toHaveTextContent('Nour Haddad')
  })

  it('marks the first place and the signed-in member in text', () => {
    seedQueue([{ memberId: 'm-nour' }, { memberId: 'm-ilra' }])
    renderPanel()

    const rows = within(queue()).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Next in line')
    expect(rows[1]).toHaveTextContent('You')
    expect(rows[1]).not.toHaveTextContent('Next in line')
  })

  it('joins the queue and reports the new position', async () => {
    seedQueue([{ memberId: 'm-nour' }])
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))

    const rows = within(queue()).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('Ilra Diagana')
    expect(
      screen.getByText('You are waiting for this slot. Position 2 of 2.'),
    ).toBeInTheDocument()
  })

  it('offers to leave once the member is waiting', () => {
    seedQueue([{ memberId: 'm-ilra' }])
    renderPanel()

    expect(screen.getByRole('button', { name: 'Leave the waitlist' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join the waitlist' })).not.toBeInTheDocument()
  })

  it('keeps focus on the control across joining and leaving', async () => {
    renderPanel()

    const join = screen.getByRole('button', { name: 'Join the waitlist' })
    join.focus()
    await userEvent.click(join)

    const leave = screen.getByRole('button', { name: 'Leave the waitlist' })
    expect(leave).toHaveFocus()

    await userEvent.click(leave)
    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toHaveFocus()
  })

  it('renumbers the people behind a member who leaves', async () => {
    seedQueue([{ memberId: 'm-nour' }, { memberId: 'm-ilra' }, { memberId: 'm-pia' }])
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Leave the waitlist' }))

    const rows = within(queue()).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Position 1 of 2')
    expect(rows[1]).toHaveTextContent('Pia Lindqvist')
    expect(rows[1]).toHaveTextContent('Position 2 of 2')
    expect(screen.getByText('You are not on this waitlist.')).toBeInTheDocument()
  })

  it('takes an optional note and clears it after joining', async () => {
    renderPanel()

    const note = screen.getByLabelText(/Note/)
    await userEvent.type(note, 'Lamp base')
    await userEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))

    expect(screen.queryByLabelText(/Note/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Leave the waitlist' }))
    expect(screen.getByLabelText(/Note/)).toHaveValue('')
  })

  it('warns a member who would be passed over, and why', () => {
    // Pia holds no laser sign-off, so she would be skipped at promotion time.
    signInAs('m-pia')
    renderPanel()

    expect(screen.getByText('You would be passed over')).toBeInTheDocument()
    expect(screen.getByText(/needs the Laser basic sign-off/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toBeEnabled()
  })

  it('does not read the holder\'s own booking as a reason to pass a member over', () => {
    renderPanel()

    expect(screen.queryByText('You would be passed over')).not.toBeInTheDocument()
  })

  it('renders nothing for a machine that is not in the workshop', () => {
    renderPanel({ ...SLOT, machineId: 'gone' })

    expect(screen.queryByRole('region', { name: /Waitlist for/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
