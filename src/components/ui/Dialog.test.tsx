import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

function Harness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel booking">
        <p>This frees the slot.</p>
        <Button>Confirm</Button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Hidden">
        <p>Body</p>
      </Dialog>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exposes a modal dialog labelled by its title', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Cancel booking" description="Frees the slot">
        <p>Body</p>
      </Dialog>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Cancel booking')
    expect(dialog).toHaveAccessibleDescription('Frees the slot')
  })

  it('moves focus in on open and restores it on close', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })

    await userEvent.click(trigger)
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Cancel booking">
        <Button>Confirm</Button>
      </Dialog>,
    )

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on the backdrop but not the panel', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Cancel booking">
        <p>Body</p>
      </Dialog>,
    )

    await userEvent.click(screen.getByText('Body'))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps Tab inside the dialog', async () => {
    render(
      <Dialog open onClose={vi.fn()} title="Cancel booking">
        <Button>Confirm</Button>
      </Dialog>,
    )

    const close = screen.getByRole('button', { name: 'Close dialog' })
    const confirm = screen.getByRole('button', { name: 'Confirm' })

    expect(close).toHaveFocus()

    await userEvent.tab()
    expect(confirm).toHaveFocus()

    await userEvent.tab()
    expect(close).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(confirm).toHaveFocus()
  })

  it('locks background scrolling while open and releases it after', () => {
    const { rerender } = render(
      <Dialog open onClose={vi.fn()} title="Cancel booking">
        <p>Body</p>
      </Dialog>,
    )

    expect(document.body).toHaveStyle({ overflow: 'hidden' })

    rerender(
      <Dialog open={false} onClose={vi.fn()} title="Cancel booking">
        <p>Body</p>
      </Dialog>,
    )

    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })

  it('renders footer actions', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Cancel booking" footer={<Button>Delete</Button>}>
        <p>Body</p>
      </Dialog>,
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
