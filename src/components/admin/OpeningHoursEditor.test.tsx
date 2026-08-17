import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { OpeningHoursEditor } from '@/components/admin/OpeningHoursEditor'
import {
  dayDraftsFrom,
  EMPTY_OVERRIDES,
  type ConfigError,
  type DayDraft,
} from '@/lib/workshopConfig'

const DEFAULT_DRAFTS = dayDraftsFrom(EMPTY_OVERRIDES)

interface SetupOptions {
  drafts?: readonly DayDraft[]
  changed?: boolean
}

function setup({ drafts = DEFAULT_DRAFTS, changed = false }: SetupOptions = {}) {
  const onSave = vi.fn<(drafts: readonly DayDraft[]) => readonly ConfigError[]>(() => [])
  const onReset = vi.fn()

  render(
    <OpeningHoursEditor
      drafts={drafts}
      defaults={DEFAULT_DRAFTS}
      onSave={onSave}
      onReset={onReset}
      changed={changed}
    />,
  )

  return { onSave, onReset }
}

const opens = (day: string) => screen.getByLabelText(`Opens on ${day}`)
const closes = (day: string) => screen.getByLabelText(`Closes on ${day}`)
const closedAllDay = (day: string) => screen.getByLabelText(`Closed all day on ${day}`)

async function retype(input: HTMLElement, value: string) {
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save opening hours' }))

describe('OpeningHoursEditor', () => {
  it('shows a labelled window for every day of the week', () => {
    setup()

    expect(screen.getAllByRole('group')).toHaveLength(7)
    expect(opens('Monday')).toHaveValue('17:00')
    expect(closes('Monday')).toHaveValue('22:00')
    expect(opens('Saturday')).toHaveValue('09:00')
  })

  it('saves an edited window as minutes from midnight', async () => {
    const { onSave } = setup()

    await retype(opens('Monday'), '18:30')
    await retype(closes('Monday'), '21:00')
    await save()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0][0]).toEqual({
      day: 0,
      closed: false,
      openMinute: 1110,
      closeMinute: 1260,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
  })

  it('marks a day closed, states it in words, and disables its times', async () => {
    const { onSave } = setup()

    await userEvent.click(closedAllDay('Wednesday'))

    expect(screen.getByText('Closed: nothing can be booked on Wednesday.')).toBeInTheDocument()
    expect(opens('Wednesday')).toBeDisabled()
    expect(closes('Wednesday')).toBeDisabled()

    await save()
    expect(onSave.mock.calls[0][0][2]).toMatchObject({ day: 2, closed: true })
  })

  it('counts the days the workshop is open', async () => {
    setup()

    expect(screen.getByText(/open on 7 of 7 days/)).toBeInTheDocument()

    await userEvent.click(closedAllDay('Sunday'))
    expect(screen.getByText(/open on 6 of 7 days/)).toBeInTheDocument()
  })

  it('re-opens a closed day with the times it kept', async () => {
    const { onSave } = setup()

    await userEvent.click(closedAllDay('Tuesday'))
    await userEvent.click(closedAllDay('Tuesday'))

    expect(opens('Tuesday')).toBeEnabled()
    expect(opens('Tuesday')).toHaveValue('17:00')

    await save()
    expect(onSave.mock.calls[0][0][1]).toMatchObject({ day: 1, closed: false, openMinute: 1020 })
  })

  it('refuses a window that closes before it opens, and saves nothing', async () => {
    const { onSave } = setup()

    await retype(closes('Thursday'), '09:00')
    await save()

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Thursday: Closing time must be after opening time.')
    expect(closes('Thursday')).toHaveAttribute('aria-invalid', 'true')
    expect(closes('Thursday').getAttribute('aria-describedby')).toBe(error.id)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses a window with no length at all', async () => {
    const { onSave } = setup()

    await retype(closes('Monday'), '17:00')
    await save()

    expect(screen.getByRole('alert')).toHaveTextContent('Closing time must be after opening time.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses a time it cannot read', async () => {
    const { onSave } = setup()

    await retype(opens('Friday'), 'sevenish')
    await save()

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Friday: Enter an opening time.')
    expect(opens('Friday').getAttribute('aria-describedby')).toBe(error.id)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses a time outside its own day', async () => {
    const { onSave } = setup()

    await retype(closes('Saturday'), '26:00')
    await save()

    // 26:00 is not a time of day, so the row reports an unreadable time.
    expect(screen.getByRole('alert')).toHaveTextContent('Saturday: Enter a closing time.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reports every broken day at once', async () => {
    const { onSave } = setup()

    await retype(closes('Monday'), '09:00')
    await retype(opens('Tuesday'), 'noon')
    await save()

    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('ignores the times of a day that is closed', async () => {
    const { onSave } = setup()

    await retype(closes('Monday'), '09:00')
    await userEvent.click(closedAllDay('Monday'))
    await save()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('clears the error once the window is fixed', async () => {
    setup()

    await retype(closes('Monday'), '09:00')
    await save()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await retype(closes('Monday'), '23:00')
    await save()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(closes('Monday')).not.toHaveAttribute('aria-invalid')
  })

  it('shows the refusals the store returns', async () => {
    const onSave = vi.fn(() => [
      { code: 'window-order' as const, field: 'closeMinute' as const, day: 0, message: 'Nope.' },
    ])
    render(
      <OpeningHoursEditor
        drafts={DEFAULT_DRAFTS}
        defaults={DEFAULT_DRAFTS}
        onSave={onSave}
        onReset={vi.fn()}
        changed={false}
      />,
    )

    await save()

    expect(screen.getByRole('alert')).toHaveTextContent('Monday: Nope.')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('says whether the week is on its defaults', () => {
    setup()

    expect(screen.getByText('Default hours')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore default hours' })).toBeDisabled()
  })

  it('restores the shipped week', async () => {
    const edited = DEFAULT_DRAFTS.map((draft) =>
      draft.day === 0 ? { ...draft, closed: true } : draft,
    )
    const { onReset } = setup({ drafts: edited, changed: true })

    expect(screen.getByText('Changed from the default')).toBeInTheDocument()
    expect(closedAllDay('Monday')).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Restore default hours' }))

    expect(onReset).toHaveBeenCalledTimes(1)
    expect(closedAllDay('Monday')).not.toBeChecked()
    expect(opens('Monday')).toHaveValue('17:00')
  })
})
