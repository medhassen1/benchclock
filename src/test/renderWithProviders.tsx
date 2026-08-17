import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { ToastProvider } from '@/components/ui/ToastProvider'
import { AuditProvider } from '@/state/AuditProvider'
import { BoardProvider } from '@/state/BoardProvider'
import { MaintenanceProvider } from '@/state/MaintenanceProvider'
import { PreferencesProvider } from '@/state/PreferencesProvider'
import { SeriesProvider } from '@/state/SeriesProvider'
import { SessionProvider } from '@/state/SessionProvider'
import { StockProvider } from '@/state/StockProvider'
import { WaitlistProvider } from '@/state/WaitlistProvider'
import { WorkshopConfigProvider } from '@/state/WorkshopConfigProvider'

export interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial history entry, defaulting to the board. */
  route?: string
  /**
   * Mount the audit trail. Defaults to true to match the app; pass false to
   * exercise the paths that degrade gracefully when it is absent.
   */
  withAudit?: boolean
}

/**
 * Mirrors the provider stack in App.tsx exactly. Keeping the two in step
 * matters: a page that works in a test but not in the app, or the reverse,
 * usually means these have drifted apart.
 */
function Providers({
  children,
  route,
  withAudit,
}: {
  children: ReactNode
  route: string
  withAudit: boolean
}) {
  const inner = (
    <BoardProvider>
      <MaintenanceProvider>
        <SeriesProvider>
          <WaitlistProvider>
            <StockProvider>{children}</StockProvider>
          </WaitlistProvider>
        </SeriesProvider>
      </MaintenanceProvider>
    </BoardProvider>
  )
  const audited = withAudit ? <AuditProvider>{inner}</AuditProvider> : inner

  return (
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ToastProvider>
        <PreferencesProvider>
          <WorkshopConfigProvider>
            <SessionProvider>
              {audited}
            </SessionProvider>
          </WorkshopConfigProvider>
        </PreferencesProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

/** Renders `ui` inside the same provider stack the real application uses. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', withAudit = true, ...options }: ProvidersOptions = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers route={route} withAudit={withAudit}>
        {children}
      </Providers>
    ),
    ...options,
  })
}

/** Signs a specific member in before the first render. */
export function signInAs(memberId: string): void {
  window.localStorage.setItem('benchclock:member:v1', JSON.stringify(memberId))
}
