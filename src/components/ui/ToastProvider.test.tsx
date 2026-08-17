import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '@/components/ui/ToastProvider'
import { useToast, type ToastInput } from '@/components/ui/toast-context'

function Trigger({ toast }: { toast: ToastInput }) {
  const { notify } = useToast()
  return (
    <button type="button" onClick={() => notify(toast)}>
      Notify
    </button>
  )
}

const renderWithProvider = (toast: ToastInput) =>
  render(
    <ToastProvider>
      <Trigger toast={toast} />
    </ToastProvider>,
  )

describe('ToastProvider', () => {
  it('shows a toast when notify is called', async () => {
    renderWithProvider({ title: 'Booking saved' })

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))

    expect(screen.getByText('Booking saved')).toBeInTheDocument()
  })

  it('announces errors assertively and other tones politely', async () => {
    renderWithProvider({ title: 'Booking refused', tone: 'error' })

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
    expect(alert).toHaveTextContent('Error: Booking refused')
  })

  it('names the tone in text so colour is not the only cue', async () => {
    renderWithProvider({ title: 'Booking saved', tone: 'success' })

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))

    expect(screen.getByRole('status')).toHaveTextContent('Success: Booking saved')
  })

  it('dismisses on demand', async () => {
    renderWithProvider({ title: 'Booking saved' })

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Booking saved' }))

    expect(screen.queryByText('Booking saved')).not.toBeInTheDocument()
  })

  it('runs an action', async () => {
    const onSelect = vi.fn()
    renderWithProvider({ title: 'Booking cancelled', action: { label: 'Undo', onSelect } })

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('stacks multiple toasts', async () => {
    renderWithProvider({ title: 'Booking saved' })

    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))

    expect(screen.getAllByText('Booking saved')).toHaveLength(2)
  })

  it('throws a helpful error when used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Trigger toast={{ title: 'x' }} />)).toThrow(
      /useToast must be used inside a <ToastProvider>/,
    )
  })
})

describe('ToastProvider auto-dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes a toast after its duration', () => {
    render(
      <ToastProvider>
        <Trigger toast={{ title: 'Booking saved', duration: 1_000 }} />
      </ToastProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'Notify' }).click()
    })
    expect(screen.getByText('Booking saved')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(screen.queryByText('Booking saved')).not.toBeInTheDocument()
  })

  it('keeps a toast with duration 0 until dismissed', () => {
    render(
      <ToastProvider>
        <Trigger toast={{ title: 'Machine offline', duration: 0 }} />
      </ToastProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'Notify' }).click()
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByText('Machine offline')).toBeInTheDocument()
  })

  it('clears pending timers on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = render(
      <ToastProvider>
        <Trigger toast={{ title: 'Booking saved', duration: 5_000 }} />
      </ToastProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'Notify' }).click()
    })
    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow()
  })
})
