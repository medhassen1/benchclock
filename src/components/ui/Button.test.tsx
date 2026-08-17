import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders an accessible button with its label', () => {
    render(<Button>Book slot</Button>)

    expect(screen.getByRole('button', { name: 'Book slot' })).toBeInTheDocument()
  })

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Book</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('allows an explicit submit type', () => {
    render(<Button type="submit">Save</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('is operable with mouse and keyboard', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Book</Button>)

    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')

    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('does not fire while loading, and marks itself busy', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')

    await userEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it('stays focusable and labelled while loading', async () => {
    render(<Button loading>Saving</Button>)

    await userEvent.tab()

    expect(screen.getByRole('button', { name: 'Saving' })).toHaveFocus()
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Book
      </Button>,
    )

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('forwards a ref and arbitrary attributes', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref} aria-label="Close" data-testid="x" />)

    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByTestId('x')).toHaveAccessibleName('Close')
  })
})
