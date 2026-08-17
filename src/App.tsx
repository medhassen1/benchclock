import { Navigate, Route, Routes } from 'react-router-dom'

import { BoardPage } from '@/components/board/BoardPage'
import { MyBookingsPage } from '@/components/bookings/MyBookingsPage'
import { UsagePage } from '@/components/usage/UsagePage'
import { AppShell } from '@/components/layout/AppShell'
import { BoardProvider } from '@/state/BoardProvider'
import { SessionProvider } from '@/state/SessionProvider'

export function App() {
  return (
    <SessionProvider>
      <BoardProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<BoardPage />} />
            <Route path="/bookings" element={<MyBookingsPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BoardProvider>
    </SessionProvider>
  )
}
