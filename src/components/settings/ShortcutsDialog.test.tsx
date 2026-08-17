import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ShortcutsDialog, type ShortcutGroup } from '@/components/settings/ShortcutsDialog'

const groups: readonly ShortcutGroup[] = [
  {
    name: 'Anywhere',
    shortcuts: [{ keys: ['Ctrl', 'K'], description: 'Open the command palette' }],
  },
  {
    name: 'Booking board',
    shortcuts: [{ keys: ['Arrows'], description: 'Move between slots' }],
  },
]

describe('ShortcutsDialog', () => {
  it('renders nothing while closed', () => {
    render(<ShortcutsDialog open={false} onClose={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a dialog named after what it explains', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('Keyboard shortcuts')
    expect(dialog).toHaveAccessibleDescription(
      'Everything on the board can be reached without a mouse.',
    )
  })

  it('heads each group of shortcuts', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} groups={groups} />)

    expect(screen.getByRole('heading', { name: 'Anywhere', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Booking board', level: 3 })).toBeInTheDocument()
  })

  it('pairs each combination with what it does, as a definition list', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} groups={groups} />)

    const terms = screen.getAllByRole('term')
    const definitions = screen.getAllByRole('definition')

    expect(terms).toHaveLength(2)
    expect(terms[0]).toHaveTextContent('Ctrl')
    expect(terms[0]).toHaveTextContent('K')
    expect(definitions[0]).toHaveTextContent('Open the command palette')
  })

  it('shows every key of a combination separately', () => {
    const { container } = render(<ShortcutsDialog open onClose={vi.fn()} groups={groups} />)

    const keys = Array.from(container.ownerDocument.querySelectorAll('kbd'))

    expect(keys.map((key) => key.textContent)).toEqual(['Ctrl', 'K', 'Arrows'])
  })

  it('documents the palette shortcut by default', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Open the command palette')).toBeInTheDocument()
    expect(within(dialog).getByText('Run the highlighted command')).toBeInTheDocument()
    expect(within(dialog).getByText('Move between slots')).toBeInTheDocument()
  })

  it('lists one definition per shortcut it was given', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} groups={groups} />)

    expect(screen.getAllByRole('definition')).toHaveLength(2)
    expect(screen.queryByText('Run the highlighted command')).not.toBeInTheDocument()
  })

  it('tells Mac members which key to press instead', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />)

    expect(screen.getByText('On a Mac, press Cmd wherever Ctrl is listed.')).toBeInTheDocument()
  })

  it('closes from the footer button and from Escape', async () => {
    const onClose = vi.fn()
    render(<ShortcutsDialog open onClose={onClose} groups={groups} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
