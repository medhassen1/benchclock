import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { InductionsPage } from '@/components/inductions/InductionsPage'
import type { Enrolment } from '@/lib/inductions'
import { weekMinute } from '@/lib/weektime'
import { StockProvider } from '@/state/StockProvider'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const seedBookings = (bookings: Booking[]) =>
  window.localStorage.setItem('benchclock:bookings:v1', JSON.stringify(bookings))

const seedEnrolments = (enrolments: Enrolment[]) =>
  window.localStorage.setItem('benchclock:enrolments:v1', JSON.stringify(enrolments))

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-1',
  machineId: 'printer-b',
  memberId: 'm-pia',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  createdAt: 1,
  ...over,
})

function renderPage() {
  return renderWithProviders(
    <StockProvider>
      <InductionsPage />
    </StockProvider>,
    { route: '/inductions' },
  )
}

const session = (title: string) => screen.getByRole('article', { name: title })

const LASER_MON = 'Laser cutting, first steps'
const TEXTILES_SUN = 'Overlocker, small group'

describe('InductionsPage', () => {
  it('lists every session with its time, trainer, and room', () => {
    renderPage()

    expect(screen.getAllByRole('article')).toHaveLength(7)

    const card = session(LASER_MON)
    expect(card).toHaveTextContent('Mon 18:00 – 20:00')
    expect(card).toHaveTextContent('2 h')
    expect(card).toHaveTextContent('Ilra Diagana')
    expect(card).toHaveTextContent('Bay 1')
  })

  it('says what each session unlocks', () => {
    renderPage()

    expect(session(LASER_MON)).toHaveTextContent('Laser basic')
    expect(session(LASER_MON)).toHaveTextContent('unlocks Big laser, Desktop laser')
  })

  it('states remaining capacity in words, not a bare number', () => {
    renderPage()

    expect(within(session(LASER_MON)).getByText('Six seats left')).toBeInTheDocument()
    expect(within(session(TEXTILES_SUN)).getByText('Two seats left')).toBeInTheDocument()
  })

  it('exposes seats taken as a meter as well as text', () => {
    seedEnrolments([{ inductionId: 'ind-textiles-sun', memberId: 'm-tomas' }])
    renderPage()

    const meter = within(session(TEXTILES_SUN)).getByRole('meter', {
      name: `Seats taken on ${TEXTILES_SUN}`,
    })
    expect(meter).toHaveAttribute('aria-valuenow', '1')
    expect(meter).toHaveAttribute('aria-valuemax', '2')
  })

  it('enrols a member and shows the seat is theirs', async () => {
    const user = userEvent.setup()
    signInAs('m-pia')
    renderPage()

    await user.click(within(session(LASER_MON)).getByRole('button', { name: 'Enrol' }))

    expect(within(session(LASER_MON)).getByText('Your seat is booked')).toBeInTheDocument()
    expect(within(session(LASER_MON)).getByText('Five seats left')).toBeInTheDocument()
    expect(await screen.findByText(`Seat booked on ${LASER_MON}`)).toBeInTheDocument()
  })

  it('gives a seat up again, returning it to the room', async () => {
    const user = userEvent.setup()
    signInAs('m-pia')
    seedEnrolments([{ inductionId: 'ind-laser-mon', memberId: 'm-pia' }])
    renderPage()

    await user.click(within(session(LASER_MON)).getByRole('button', { name: 'Withdraw' }))

    expect(within(session(LASER_MON)).getByRole('button', { name: 'Enrol' })).toBeEnabled()
    expect(within(session(LASER_MON)).getByText('Six seats left')).toBeInTheDocument()
  })

  it('refuses a full session and says so in words', () => {
    signInAs('m-pia')
    seedEnrolments([
      { inductionId: 'ind-textiles-sun', memberId: 'm-tomas' },
      { inductionId: 'ind-textiles-sun', memberId: 'm-nour' },
    ])
    renderPage()

    const card = session(TEXTILES_SUN)
    expect(within(card).getByText('No seats left')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Enrol' })).toBeDisabled()
    expect(card).toHaveTextContent('is full — 2 of 2 seats taken')
  })

  it('refuses a session for a sign-off the member already holds', () => {
    // Ilra, the default member, already holds Laser basic.
    renderPage()

    const card = session(LASER_MON)
    expect(within(card).getByRole('button', { name: 'Enrol' })).toBeDisabled()
    expect(card).toHaveTextContent('You already hold the Laser basic sign-off.')
  })

  it('refuses a session that clashes with one of the member\'s bookings', () => {
    signInAs('m-pia')
    seedBookings([booking({ startMinute: at(0, 19), endMinute: at(0, 20) })])
    renderPage()

    const card = session(LASER_MON)
    expect(within(card).getByRole('button', { name: 'Enrol' })).toBeDisabled()
    expect(card).toHaveTextContent('You are already booked in at Mon 19:00.')
  })

  it('points the disabled control at the reason for screen readers', () => {
    signInAs('m-pia')
    seedBookings([booking({ startMinute: at(0, 19), endMinute: at(0, 20) })])
    renderPage()

    const card = session(LASER_MON)
    const button = within(card).getByRole('button', { name: 'Enrol' })
    const reasonId = button.getAttribute('aria-describedby')

    expect(reasonId).toBeTruthy()
    expect(document.getElementById(reasonId ?? '')).toHaveTextContent('already booked in')
  })

  it('ignores another member\'s booking at the same hour', () => {
    signInAs('m-pia')
    seedBookings([booking({ memberId: 'm-tomas', startMinute: at(0, 19), endMinute: at(0, 20) })])
    renderPage()

    expect(within(session(LASER_MON)).getByRole('button', { name: 'Enrol' })).toBeEnabled()
  })

  it('summarises the sign-offs held and still to earn', () => {
    renderPage()

    const card = screen.getByRole('group', { name: 'Your sign-offs' })
    expect(card).toHaveTextContent('Laser basic, CNC basic, CNC advanced, Metalwork')
    expect(card).toHaveTextContent('1 still to earn: Textiles')
    expect(card).toHaveTextContent('You have no induction seats booked.')
  })

  it('says when a member holds nothing yet', () => {
    signInAs('m-pia')
    renderPage()

    expect(screen.getByText('You hold no sign-offs yet.')).toBeInTheDocument()
  })

  it('counts the seats the member has booked', () => {
    signInAs('m-pia')
    seedEnrolments([{ inductionId: 'ind-laser-mon', memberId: 'm-pia' }])
    renderPage()

    expect(screen.getByRole('group', { name: 'Your sign-offs' })).toHaveTextContent(
      'You have one seat booked.',
    )
  })

  it('filters down to the sign-offs the member still needs', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('checkbox', { name: 'Only sign-offs I still need' }))

    const remaining = screen.getAllByRole('article')
    expect(remaining).toHaveLength(2)
    expect(remaining[0]).toHaveTextContent('Overlocker and textiles')
  })
})
