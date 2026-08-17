import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SettingsPage } from '@/components/settings/SettingsPage'
import { PreferencesProvider } from '@/state/PreferencesProvider'
import { PREFERENCES_KEY } from '@/state/preferences-context'

const renderSettings = () =>
  render(
    <PreferencesProvider>
      <SettingsPage />
    </PreferencesProvider>,
  )

/** Whatever is in storage under the preferences key, already parsed. */
const stored = () => JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? 'null')

describe('SettingsPage', () => {
  it('titles the page', () => {
    renderSettings()

    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
  })

  it('puts every preference in a named group', () => {
    renderSettings()

    expect(screen.getByRole('group', { name: 'Grid density' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Machines on the board' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Week start' })).toBeInTheDocument()
  })

  it('offers the densities as one radio group, describing each', () => {
    renderSettings()

    const group = screen.getByRole('group', { name: 'Grid density' })
    const radios = within(group).getAllByRole('radio')

    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'Comfortable' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Compact' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Compact' })).toHaveAccessibleDescription(
      'Thinner rows, so a whole day fits without scrolling.',
    )
  })

  it('changes the density and remembers it', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('radio', { name: 'Compact' }))

    expect(screen.getByRole('radio', { name: 'Compact' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Comfortable' })).not.toBeChecked()
    await waitFor(() => expect(stored()).toMatchObject({ density: 'compact' }))
  })

  it('toggles machines the member cannot book', async () => {
    renderSettings()

    const checkbox = screen.getByRole('checkbox', { name: 'Show machines I cannot book' })
    expect(checkbox).toBeChecked()

    await userEvent.click(checkbox)

    expect(checkbox).not.toBeChecked()
    await waitFor(() => expect(stored()).toMatchObject({ showUnbookable: false }))
  })

  it('picks the first day of the week from a labelled list', async () => {
    renderSettings()

    const select = screen.getByRole('combobox', { name: 'First day shown' })
    expect(select).toHaveValue('0')

    await userEvent.selectOptions(select, 'Saturday')

    expect(select).toHaveValue('5')
    await waitFor(() => expect(stored()).toMatchObject({ firstDay: 5 }))
  })

  it('shows the settings that were saved on the last visit', async () => {
    window.localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ density: 'compact', showUnbookable: false, firstDay: 6 }),
    )

    renderSettings()

    expect(screen.getByRole('radio', { name: 'Compact' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Show machines I cannot book' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'First day shown' })).toHaveValue('6')
  })

  it('puts everything back with a reset', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('radio', { name: 'Compact' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show machines I cannot book' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))

    expect(screen.getByRole('radio', { name: 'Comfortable' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Show machines I cannot book' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'First day shown' })).toHaveValue('0')
  })

  it('opens the shortcut help and hands focus back on close', async () => {
    renderSettings()

    const trigger = screen.getByRole('button', { name: 'Keyboard shortcuts' })
    await userEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Keyboard shortcuts')
    expect(within(dialog).getByText('Open the command palette')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
