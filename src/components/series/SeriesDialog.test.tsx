import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SeriesDialog, type SeriesDialogProps } from '@/components/series/SeriesDialog'
import { configureLatency, resetIdCounter } from '@/lib/api'
import { weekMinute } from '@/lib/weektime'
import { SeriesProvider } from '@/state/SeriesProvider'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const BOOKINGS_KEY = 'benchclock:bookings:v1'
const SERIES_KEY = 'benchclock:series:v1'

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-seeded',
  machineId: 'laser-a',
  memberId: 'm-tomas',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  createdAt: 1,
  ...over,
})

function seedBoard(bookings: Booking[]) {
  window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings))
}

function storedSeries(): Record<string, unknown>[] {
  return JSON.parse(window.localStorage.getItem(SERIES_KEY) ?? '[]') as Record<string, unknown>[]
}

function storedBookings(): Booking[] {
  return JSON.parse(window.localStorage.getItem(BOOKINGS_KEY) ?? '[]') as Booking[]
}

/** Mirrors a page holding the dialog open, so closing really unmounts it. */
function Harness(props: Omit<SeriesDialogProps, 'onClose'> & { onClose: () => void }) {
  const [open, setOpen] = useState(true)

  if (!open) return null
  return (
    <SeriesDialog
      {...props}
      onClose={() => {
        setOpen(false)
        props.onClose()
      }}
    />
  )
}

function renderDialog(props: Partial<SeriesDialogProps> = {}) {
  const onClose = vi.fn()
  const onCreated = vi.fn()

  renderWithProviders(
    <SeriesProvider>
      <Harness
        machineId="laser-a"
        startMinute={at(0, 18)}
        onCreated={onCreated}
        {...props}
        onClose={onClose}
      />
    </SeriesProvider>,
  )

  return { onClose, onCreated }
}

const preview = () => screen.getByRole('list', { name: 'Weeks in this series' })
/** Only the weeks themselves; each one nests a list of its own reasons. */
const weeks = () =>
  within(preview())
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === preview())
const summary = () => screen.getByRole('status')

beforeEach(() => {
  configureLatency(0)
  resetIdCounter()
})

afterEach(() => {
  configureLatency()
})

describe('SeriesDialog', () => {
  it('names the machine and the slot it repeats on', async () => {
    renderDialog()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Repeat Big laser weekly')
    expect(dialog).toHaveAccessibleDescription('Mon 18:00 · Bay 1')
  })

  it('moves focus into the dialog when it opens', async () => {
    renderDialog()

    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })

  it('renders nothing for a machine that does not exist', () => {
    renderDialog({ machineId: 'no-such-machine' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('previews four weeks by default, all of them free', async () => {
    renderDialog()
    await screen.findByRole('dialog')

    expect(weeks()).toHaveLength(4)
    expect(summary()).toHaveTextContent('All 4 weeks can be booked.')
    expect(weeks()[0]).toHaveTextContent('This week')
    expect(weeks()[1]).toHaveTextContent('Next week')
    expect(weeks()[3]).toHaveTextContent('In 3 weeks')
  })

  it('follows the repeat count the member chooses', async () => {
    renderDialog()
    await screen.findByRole('dialog')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Repeats for' }), '6')

    expect(weeks()).toHaveLength(6)
    expect(summary()).toHaveTextContent('All 6 weeks can be booked.')
  })

  it('handles a series of a single week', async () => {
    renderDialog()
    await screen.findByRole('dialog')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Repeats for' }), '1')

    expect(weeks()).toHaveLength(1)
    expect(summary()).toHaveTextContent('That week can be booked.')
  })

  it('shows the slot the chosen length gives', async () => {
    renderDialog()
    await screen.findByRole('dialog')

    expect(screen.getByText('18:00 – 19:00, every week')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: '1 h 30 m' }))

    expect(screen.getByText('18:00 – 19:30, every week')).toBeInTheDocument()
  })

  it('marks the week a booking already holds, and says why', async () => {
    seedBoard([booking()])
    renderDialog()
    await screen.findByRole('dialog')

    expect(summary()).toHaveTextContent('3 of 4 weeks can be booked, 1 refused.')
    expect(weeks()[0]).toHaveTextContent('Not booked')
    expect(weeks()[0]).toHaveTextContent('Big laser is already booked then.')
    expect(weeks()[1]).toHaveTextContent('Will be booked')
  })

  it('lets another member’s series hold the weeks it covers', async () => {
    window.localStorage.setItem(
      SERIES_KEY,
      JSON.stringify([
        {
          id: 'sr-0001',
          machineId: 'laser-a',
          memberId: 'm-tomas',
          startMinute: at(0, 18),
          endMinute: at(0, 19),
          note: '',
          repeatCount: 2,
          mode: 'skip-refused',
          createdAt: 1,
        },
      ]),
    )
    renderDialog()
    await screen.findByRole('dialog')

    expect(summary()).toHaveTextContent('2 of 4 weeks can be booked, 2 refused.')
    expect(weeks()[1]).toHaveTextContent('Not booked')
    expect(weeks()[2]).toHaveTextContent('Will be booked')
  })

  it('holds every week back in all-or-nothing mode', async () => {
    seedBoard([booking()])
    renderDialog()
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('radio', { name: /every week or none/ }))

    expect(summary()).toHaveTextContent('Nothing will be booked: 1 week of 4 refused.')
    expect(weeks()[1]).toHaveTextContent('Not booked')
    expect(weeks()[1]).toHaveTextContent('every week must be free in this mode')
    expect(screen.getByRole('button', { name: 'Book series' })).toBeDisabled()
  })

  it('refuses the whole series when the member lacks the sign-off', async () => {
    signInAs('m-pia')
    renderDialog()
    await screen.findByRole('dialog')

    expect(summary()).toHaveTextContent('None of the 4 weeks can be booked.')
    expect(screen.getAllByText('Big laser needs the Laser basic sign-off.')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Book series' })).toBeDisabled()
  })

  it('refuses a slot that runs past closing time', async () => {
    renderDialog({ startMinute: at(0, 21, 30) })
    await screen.findByRole('dialog')

    expect(summary()).toHaveTextContent('None of the 4 weeks can be booked.')
    expect(
      screen.getAllByText('The workshop is closed then, or the slot runs past closing time.'),
    ).toHaveLength(4)
  })

  it('refuses a slot that would spill past Sunday', async () => {
    renderDialog({ machineId: 'printer-b', startMinute: at(6, 23, 30) })
    await screen.findByRole('dialog')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Repeats for' }), '2')

    expect(summary()).toHaveTextContent('None of the 2 weeks can be booked.')
    expect(screen.getByRole('button', { name: 'Book series' })).toBeDisabled()
  })

  it('stores the series and puts this week on the board', async () => {
    const { onClose, onCreated } = renderDialog()
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: 'Book series' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sr-0001', repeatCount: 4 }),
      expect.objectContaining({ seriesId: 'sr-0001' }),
    )

    await waitFor(() => expect(storedSeries()).toHaveLength(1))
    expect(storedSeries()[0]).toMatchObject({
      machineId: 'laser-a',
      memberId: 'm-ilra',
      startMinute: at(0, 18),
      endMinute: at(0, 19),
      repeatCount: 4,
      mode: 'skip-refused',
    })

    await waitFor(() => expect(storedBookings()).toHaveLength(1))
    expect(storedBookings()[0]).toMatchObject({ machineId: 'laser-a', startMinute: at(0, 18) })
  })

  it('announces the outcome once the series is stored', async () => {
    renderDialog()
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: 'Book series' }))

    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('Series booked on Big laser')
    expect(toast).toHaveTextContent('All 4 weeks can be booked.')
  })

  it('keeps the note with the series', async () => {
    renderDialog()
    await screen.findByRole('dialog')

    await userEvent.type(screen.getByRole('textbox', { name: /Note/ }), 'Lamp base')
    await userEvent.click(screen.getByRole('button', { name: 'Book series' }))

    await waitFor(() => expect(storedSeries()).toHaveLength(1))
    expect(storedSeries()[0]).toMatchObject({ note: 'Lamp base' })
  })

  it('leaves this week off the board when only later weeks fit', async () => {
    seedBoard([booking()])
    renderDialog()
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: 'Book series' }))

    await waitFor(() => expect(storedSeries()).toHaveLength(1))
    // Only the booking that was already there; this week was skipped.
    expect(storedBookings()).toHaveLength(1)
    expect(storedBookings()[0].id).toBe('bk-seeded')
  })

  it('stores nothing when the member backs out', async () => {
    const { onClose } = renderDialog()
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(storedSeries()).toEqual([])
  })

  it('closes on Escape without storing a series', async () => {
    const { onClose } = renderDialog()
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
    expect(storedSeries()).toEqual([])
  })
})
