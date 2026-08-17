import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { BoardProvider } from '@/state/BoardProvider'
import { SessionProvider } from '@/state/SessionProvider'

export interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial history entry, defaulting to the board. */
  route?: string
}

function Providers({ children, route }: { children: ReactNode; route: string }) {
  return (
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SessionProvider>
        <BoardProvider>{children}</BoardProvider>
      </SessionProvider>
    </MemoryRouter>
  )
}

/** Renders `ui` inside the same provider stack the real application uses. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: ProvidersOptions = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <Providers route={route}>{children}</Providers>,
    ...options,
  })
}

/** Signs a specific member in before the first render. */
export function signInAs(memberId: string): void {
  window.localStorage.setItem('benchclock:member:v1', JSON.stringify(memberId))
}
