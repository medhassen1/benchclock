import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AdminPage } from '@/components/admin/AdminPage'
import { CONFIG_STORAGE_KEY } from '@/lib/workshopConfig'
import { WorkshopConfigProvider } from '@/state/WorkshopConfigProvider'
import { renderWithProviders, signInAs } from '@/test/renderWithProviders'

/** Renders the admin page for a member, defaulting to the keyholder. */
function renderAdmin(memberId = 'm-ilra') {
  signInAs(memberId)
  return renderWithProviders(
    <WorkshopConfigProvider>
      <AdminPage />
    </WorkshopConfigProvider>,
    { route: '/admin' },
  )
}

const tab = (name: string) => screen.getByRole('tab', { name })
const storedConfig = () => JSON.parse(window.localStorage.getItem(CONFIG_STORAGE_KEY) ?? '{}')

async function retype(name: RegExp | string, value: string) {
  const input = screen.getByLabelText(name)
  await userEvent.clear(input)
  if (value !== '') await userEvent.type(input, value)
}

describe('AdminPage', () => {
  it('tells a regular member they need keyholder access', () => {
    renderAdmin('m-tomas')

    expect(screen.getByRole('heading', { name: 'You need keyholder access' })).toBeInTheDocument()
    expect(screen.getByText(/signed in as Tomas Berg, a regular member/)).toBeInTheDocument()
  })

  it('shows a casual member no settings controls at all', () => {
    renderAdmin('m-pia')

    expect(screen.getByRole('heading', { name: 'You need keyholder access' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save machine' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Machine to edit')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore all defaults' })).not.toBeInTheDocument()
  })

  it('lets a keyholder in', () => {
    renderAdmin()

    expect(screen.getByRole('heading', { name: 'Workshop settings' })).toBeInTheDocument()
    expect(screen.queryByText('You need keyholder access')).not.toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Workshop settings sections' })).toBeInTheDocument()
  })

  it('opens on the machines tab with the first machine loaded', () => {
    renderAdmin()

    expect(tab('Machines')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Machine to edit')).toHaveValue('laser-a')
    expect(screen.getByLabelText('Machine name')).toHaveValue('Big laser')
  })

  it('switches to the opening hours tab', async () => {
    renderAdmin()

    await userEvent.click(tab('Opening hours'))

    expect(tab('Opening hours')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Opens on Monday')).toHaveValue('17:00')
    expect(screen.queryByLabelText('Machine name')).not.toBeInTheDocument()
  })

  it('moves between tabs with the arrow keys', async () => {
    renderAdmin()

    tab('Machines').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Opening hours')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Opening hours')).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(tab('Machines')).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{End}')
    expect(tab('Members')).toHaveAttribute('aria-selected', 'true')
  })

  it('lists the members and their allowances', async () => {
    renderAdmin()

    await userEvent.click(tab('Members'))

    const row = screen.getByRole('row', { name: /Ilra Diagana/ })
    expect(within(row).getByText('Keyholder')).toBeInTheDocument()
    expect(within(row).getByText('15 h')).toBeInTheDocument()
    expect(within(row).getByText('You')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Pia Lindqvist/ })).toHaveTextContent('None yet')
  })

  it('loads another machine into the editor', async () => {
    renderAdmin()

    await userEvent.selectOptions(screen.getByLabelText('Machine to edit'), 'welder-a')

    expect(screen.getByLabelText('Machine name')).toHaveValue('MIG welder')
    expect(screen.getByLabelText('Out of service')).toBeChecked()
    expect(screen.getByText(/Out of service: nobody can book this machine/)).toBeInTheDocument()
  })

  it('saves a machine edit and persists it', async () => {
    renderAdmin()

    await retype('Longest booking (minutes)', '60')
    await userEvent.click(screen.getByRole('button', { name: 'Save machine' }))

    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
    expect(screen.getByText('Changed from the default')).toBeInTheDocument()
    expect(screen.getByText(/1 setting has been changed from the defaults/)).toBeInTheDocument()

    await waitFor(() =>
      expect(storedConfig()).toMatchObject({ machines: { 'laser-a': { maxSessionMinutes: 60 } } }),
    )
  })

  it('refuses an invalid machine edit and stores nothing', async () => {
    renderAdmin()

    await retype('Longest booking (minutes)', '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save machine' }))

    expect(screen.getByRole('alert')).toHaveTextContent('more than zero minutes')
    expect(
      screen.getByText(/Everything is on the settings the workshop shipped with/),
    ).toBeInTheDocument()
    await waitFor(() => expect(storedConfig()).toMatchObject({ machines: {} }))
  })

  it('closes a day and records it', async () => {
    renderAdmin()

    await userEvent.click(tab('Opening hours'))
    await userEvent.click(screen.getByLabelText('Closed all day on Sunday'))
    await userEvent.click(screen.getByRole('button', { name: 'Save opening hours' }))

    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
    await waitFor(() => expect(storedConfig().days['6']).toMatchObject({ closed: true }))
  })

  it('refuses a broken opening window', async () => {
    renderAdmin()

    await userEvent.click(tab('Opening hours'))
    await retype('Closes on Monday', '09:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save opening hours' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Closing time must be after opening time.')
    await waitFor(() => expect(storedConfig().days).toEqual({}))
  })

  it('cannot restore defaults when nothing has been changed', () => {
    renderAdmin()

    expect(screen.getByRole('button', { name: 'Restore all defaults' })).toBeDisabled()
  })

  it('restores every default after confirming', async () => {
    renderAdmin()

    await retype('Machine name', 'Huge laser')
    await userEvent.click(screen.getByRole('button', { name: 'Save machine' }))
    expect(screen.getByText('Changed from the default')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Restore all defaults' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore all defaults' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Machine name')).toHaveValue('Big laser')
    expect(screen.getByText('Default settings')).toBeInTheDocument()
    expect(
      screen.getByText(/Everything is on the settings the workshop shipped with/),
    ).toBeInTheDocument()
  })

  it('keeps the changes when the reset is cancelled', async () => {
    renderAdmin()

    await retype('Machine name', 'Huge laser')
    await userEvent.click(screen.getByRole('button', { name: 'Save machine' }))

    await userEvent.click(screen.getByRole('button', { name: 'Restore all defaults' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep my changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Machine name')).toHaveValue('Huge laser')
  })

  it('restores one machine on its own', async () => {
    renderAdmin()

    await retype('Cool-down (minutes)', '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save machine' }))
    await waitFor(() => expect(storedConfig().machines['laser-a']).toBeDefined())

    await userEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))

    expect(screen.getByLabelText('Cool-down (minutes)')).toHaveValue('30')
    await waitFor(() => expect(storedConfig().machines).toEqual({}))
  })

  it('reloads the stored settings for the next visit', async () => {
    const first = renderAdmin()

    await retype('Machine name', 'Huge laser')
    await userEvent.click(screen.getByRole('button', { name: 'Save machine' }))
    await waitFor(() => expect(storedConfig().machines['laser-a']).toBeDefined())
    first.unmount()

    renderAdmin()

    await waitFor(() => expect(screen.getByLabelText('Machine name')).toHaveValue('Huge laser'))
  })
})
