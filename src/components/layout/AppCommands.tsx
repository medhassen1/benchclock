import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { CommandPalette } from '@/components/palette/CommandPalette'
import type { Command } from '@/components/palette/commands'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'

interface Destination {
  id: string
  label: string
  to: string
  keywords: readonly string[]
}

const DESTINATIONS: readonly Destination[] = [
  { id: 'board', label: 'Go to board', to: '/', keywords: ['grid', 'slots', 'book', 'week'] },
  {
    id: 'bookings',
    label: 'Go to my bookings',
    to: '/bookings',
    keywords: ['mine', 'reservations'],
  },
  { id: 'series', label: 'Go to repeats', to: '/series', keywords: ['recurring', 'weekly'] },
  { id: 'waitlist', label: 'Go to waiting for', to: '/waitlist', keywords: ['queue', 'position'] },
  {
    id: 'inductions',
    label: 'Go to inductions',
    to: '/inductions',
    keywords: ['training', 'sign-off', 'ticket'],
  },
  {
    id: 'maintenance',
    label: 'Go to maintenance',
    to: '/maintenance',
    keywords: ['service', 'downtime', 'repair'],
  },
  { id: 'stock', label: 'Go to stock', to: '/stock', keywords: ['consumables', 'materials'] },
  { id: 'usage', label: 'Go to usage', to: '/usage', keywords: ['allowance', 'hours'] },
  {
    id: 'reports',
    label: 'Go to reports',
    to: '/reports',
    keywords: ['utilisation', 'heatmap', 'peak'],
  },
  { id: 'audit', label: 'Go to activity', to: '/audit', keywords: ['log', 'history', 'trail'] },
  {
    id: 'data',
    label: 'Go to import and export',
    to: '/data',
    keywords: ['csv', 'download', 'upload'],
  },
  { id: 'admin', label: 'Go to admin', to: '/admin', keywords: ['configure', 'machines'] },
  {
    id: 'settings',
    label: 'Go to settings',
    to: '/settings',
    keywords: ['preferences', 'density', 'theme'],
  },
]

/**
 * Builds the palette's command list. Kept beside the shell rather than inside
 * CommandPalette so the palette stays a generic, route-agnostic primitive.
 */
export function AppCommands() {
  const navigate = useNavigate()
  const { member } = useSession()
  const { bookings } = useBoard()

  const mine = bookings.filter((booking) => booking.memberId === member.id).length

  const commands = useMemo<Command[]>(
    () => [
      ...DESTINATIONS.map((destination) => ({
        id: destination.id,
        label: destination.label,
        keywords: destination.keywords,
        run: () => navigate(destination.to),
      })),
      {
        id: 'my-next',
        label: 'Review my bookings',
        keywords: ['next', 'upcoming'],
        hint: mine === 1 ? '1 booked' : `${mine} booked`,
        disabled: mine === 0,
        run: () => navigate('/bookings'),
      },
      {
        id: 'admin-hours',
        label: 'Edit opening hours',
        keywords: ['open', 'close', 'times'],
        hint: member.tier === 'keyholder' ? undefined : 'Keyholders only',
        disabled: member.tier !== 'keyholder',
        run: () => navigate('/admin'),
      },
    ],
    [navigate, mine, member.tier],
  )

  return <CommandPalette commands={commands} />
}
