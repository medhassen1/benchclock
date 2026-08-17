import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CommandPalette } from '@/components/palette/CommandPalette'
import type { Command } from '@/components/palette/commands'

const run = {
  board: vi.fn(),
  mine: vi.fn(),
  usage: vi.fn(),
  settings: vi.fn(),
  cancel: vi.fn(),
}

const commands = (): Command[] => [
  { id: 'board', label: 'Go to booking board', keywords: ['grid'], hint: 'Ctrl K', run: run.board },
  { id: 'mine', label: 'My bookings', keywords: ['reservations'], run: run.mine },
  { id: 'usage', label: 'Workshop usage', run: run.usage },
  { id: 'settings', label: 'Open settings', keywords: ['preferences'], run: run.settings },
  { id: 'cancel', label: 'Cancel booking', disabled: true, run: run.cancel },
]

/** A trigger outside the palette, so focus restoration has somewhere to land. */
function Harness({ list = commands() }: { list?: Command[] }) {
  return (
    <>
      <button type="button">Board</button>
      <CommandPalette commands={list} />
    </>
  )
}

const openPalette = () => userEvent.keyboard('{Control>}k{/Control}')

const input = () => screen.getByRole('combobox', { name: 'Run a command' })
const labels = () => screen.getAllByRole('option').map((option) => option.textContent)
const selected = () => screen.getByRole('option', { selected: true })

describe('CommandPalette', () => {
  it('stays out of the way until it is called', () => {
    render(<Harness />)

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('opens on Ctrl+K', async () => {
    render(<Harness />)

    await openPalette()

    expect(input()).toHaveFocus()
  })

  it('opens on Cmd+K for a member on a Mac', async () => {
    render(<Harness />)

    await userEvent.keyboard('{Meta>}k{/Meta}')

    expect(input()).toBeInTheDocument()
  })

  it('ignores Ctrl+Shift+K, which is a different combination', async () => {
    render(<Harness />)

    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}')

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('wires the combobox to its listbox', async () => {
    render(<Harness />)
    await openPalette()

    const field = input()
    const list = screen.getByRole('listbox', { name: 'Run a command' })

    expect(field).toHaveAttribute('aria-expanded', 'true')
    expect(field).toHaveAttribute('aria-controls', list.id)
    expect(field).toHaveAttribute('aria-activedescendant', selected().id)
  })

  it('lists every command in the authored order to start with', async () => {
    render(<Harness />)
    await openPalette()

    expect(labels()).toEqual([
      'Go to booking boardCtrl K',
      'My bookings',
      'Workshop usage',
      'Open settings',
      'Cancel booking',
    ])
    expect(selected()).toHaveTextContent('Go to booking board')
  })

  it('filters as the member types', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.type(input(), 'settings')

    expect(labels()).toEqual(['Open settings'])
  })

  it('finds a command by a hidden keyword', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.type(input(), 'reservations')

    expect(labels()).toEqual(['My bookings'])
  })

  it('moves the highlight with the arrow keys', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{ArrowDown}')
    expect(selected()).toHaveTextContent('My bookings')

    await userEvent.keyboard('{ArrowDown}')
    expect(selected()).toHaveTextContent('Workshop usage')

    await userEvent.keyboard('{ArrowUp}')
    expect(selected()).toHaveTextContent('My bookings')
  })

  it('wraps around at both ends', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{ArrowUp}')
    expect(selected()).toHaveTextContent('Cancel booking')

    await userEvent.keyboard('{ArrowDown}')
    expect(selected()).toHaveTextContent('Go to booking board')
  })

  it('jumps to the ends with Home and End', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{End}')
    expect(selected()).toHaveTextContent('Cancel booking')

    await userEvent.keyboard('{Home}')
    expect(selected()).toHaveTextContent('Go to booking board')
  })

  it('keeps aria-activedescendant on the highlighted option', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{ArrowDown}')

    expect(input()).toHaveAttribute('aria-activedescendant', selected().id)
  })

  it('runs the highlighted command on Enter and closes', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(run.mine).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('runs a command when it is clicked', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.click(screen.getByRole('option', { name: /Workshop usage/ }))

    expect(run.usage).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('refuses to run a disabled command, by keyboard or by click', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{End}{Enter}')
    expect(run.cancel).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Cancel booking' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    await userEvent.click(screen.getByRole('option', { name: 'Cancel booking' }))
    expect(run.cancel).not.toHaveBeenCalled()

    // The palette stays open so the member can pick something that works.
    expect(input()).toBeInTheDocument()
  })

  it('says so when nothing matches, and runs nothing on Enter', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.type(input(), 'sandblaster')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(input()).toHaveAttribute('aria-expanded', 'false')
    expect(input()).not.toHaveAttribute('aria-activedescendant')
    expect(screen.getByRole('status')).toHaveTextContent('No command matches that.')

    await userEvent.keyboard('{Enter}')
    expect(run.board).not.toHaveBeenCalled()
    expect(input()).toBeInTheDocument()
  })

  it('does not move the highlight when there is nothing to move to', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.type(input(), 'sandblaster')
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Home}{End}')

    expect(input()).not.toHaveAttribute('aria-activedescendant')
  })

  it('clamps the highlight when the list shrinks under it', async () => {
    const { rerender } = render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{End}')
    expect(selected()).toHaveTextContent('Cancel booking')

    // The board changes underneath the palette and drops most commands.
    rerender(<Harness list={commands().slice(0, 2)} />)

    expect(labels()).toEqual(['Go to booking boardCtrl K', 'My bookings'])
    expect(selected()).toHaveTextContent('My bookings')
    expect(input()).toHaveAttribute('aria-activedescendant', selected().id)

    // Enter runs the command that is actually highlighted, not a stale index.
    await userEvent.keyboard('{Enter}')
    expect(run.mine).toHaveBeenCalledTimes(1)
  })

  it('starts a new query from the best match', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{End}')
    await userEvent.type(input(), 'boo')

    expect(selected()).toHaveTextContent('Go to booking board')
  })

  it('closes on Escape without running anything', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(run.board).not.toHaveBeenCalled()
  })

  it('closes on a second Ctrl+K, even from inside the field', async () => {
    render(<Harness />)
    await openPalette()

    await openPalette()

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('closes when the backdrop is clicked, but not the panel', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.click(screen.getByRole('listbox'))
    expect(input()).toBeInTheDocument()

    await userEvent.click(screen.getByRole('listbox').parentElement?.parentElement as HTMLElement)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('gives focus back to where it came from', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Board' })
    trigger.focus()

    await openPalette()
    expect(input()).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('forgets the previous query when it opens again', async () => {
    render(<Harness />)
    await openPalette()

    await userEvent.type(input(), 'usage')
    await userEvent.keyboard('{Escape}')
    await openPalette()

    expect(input()).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(5)
  })

  it('reports opening and closing', async () => {
    const onOpenChange = vi.fn()
    render(<CommandPalette commands={commands()} onOpenChange={onOpenChange} />)

    await openPalette()
    await userEvent.keyboard('{Escape}')

    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
  })
})
