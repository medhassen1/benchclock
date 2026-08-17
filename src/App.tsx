import { Navigate, Route, Routes } from 'react-router-dom'

import { BoardPage } from '@/components/board/BoardPage'
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BoardProvider>
    </SessionProvider>
  )
}
