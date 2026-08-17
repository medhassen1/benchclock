import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminPage } from '@/components/admin/AdminPage'
import { AuditLogPage } from '@/components/audit/AuditLogPage'
import { BoardPage } from '@/components/board/BoardPage'
import { MyBookingsPage } from '@/components/bookings/MyBookingsPage'
import { DataPage } from '@/components/data/DataPage'
import { InductionsPage } from '@/components/inductions/InductionsPage'
import { AppShell } from '@/components/layout/AppShell'
import { MaintenancePage } from '@/components/maintenance/MaintenancePage'
import { ReportsPage } from '@/components/reports/ReportsPage'
import { SeriesPage } from '@/components/series/SeriesPage'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { StockPage } from '@/components/stock/StockPage'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { UsagePage } from '@/components/usage/UsagePage'
import { WaitlistPage } from '@/components/waitlist/WaitlistPage'
import { AuditProvider } from '@/state/AuditProvider'
import { BoardProvider } from '@/state/BoardProvider'
import { MaintenanceProvider } from '@/state/MaintenanceProvider'
import { PreferencesProvider } from '@/state/PreferencesProvider'
import { SeriesProvider } from '@/state/SeriesProvider'
import { SessionProvider } from '@/state/SessionProvider'
import { StockProvider } from '@/state/StockProvider'
import { WaitlistProvider } from '@/state/WaitlistProvider'
import { WorkshopConfigProvider } from '@/state/WorkshopConfigProvider'

/**
 * Provider order matters: everything that records activity sits inside
 * ToastProvider and AuditProvider, and anything that reads or writes bookings
 * sits inside BoardProvider. WaitlistProvider in particular books a slot when
 * it promotes someone, so it must be nested within the board.
 */
export function App() {
  return (
    <ToastProvider>
      <PreferencesProvider>
        <WorkshopConfigProvider>
          <SessionProvider>
            <AuditProvider>
              <BoardProvider>
                <MaintenanceProvider>
                  <SeriesProvider>
                    <WaitlistProvider>
                      <StockProvider>
                        <AppShell>
                          <Routes>
                            <Route path="/" element={<BoardPage />} />
                            <Route path="/bookings" element={<MyBookingsPage />} />
                            <Route path="/series" element={<SeriesPage />} />
                            <Route path="/waitlist" element={<WaitlistPage />} />
                            <Route path="/inductions" element={<InductionsPage />} />
                            <Route path="/maintenance" element={<MaintenancePage />} />
                            <Route path="/stock" element={<StockPage />} />
                            <Route path="/usage" element={<UsagePage />} />
                            <Route path="/reports" element={<ReportsPage />} />
                            <Route path="/data" element={<DataPage />} />
                            <Route path="/audit" element={<AuditLogPage />} />
                            <Route path="/admin" element={<AdminPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
                        </AppShell>
                      </StockProvider>
                    </WaitlistProvider>
                  </SeriesProvider>
                </MaintenanceProvider>
              </BoardProvider>
            </AuditProvider>
          </SessionProvider>
        </WorkshopConfigProvider>
      </PreferencesProvider>
    </ToastProvider>
  )
}
