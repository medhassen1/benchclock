import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatTile } from '@/components/reports/StatTile'

describe('StatTile', () => {
  it('is a group named after its label', () => {
    render(<StatTile label="Workshop utilisation" value="42%" />)

    const tile = screen.getByRole('group', { name: 'Workshop utilisation' })
    expect(tile).toHaveTextContent('42%')
  })

  it('shows the supporting note when there is one', () => {
    render(<StatTile label="Booked" value="12 h" note="of 30 h bookable" />)

    expect(screen.getByText('of 30 h bookable')).toBeInTheDocument()
  })

  it('omits the note entirely when none is given', () => {
    render(<StatTile label="Booked" value="12 h" />)

    expect(screen.getByRole('group', { name: 'Booked' })).toHaveTextContent(/^Booked12 h$/)
  })

  it('states a rising trend in words, not by an arrow alone', () => {
    render(<StatTile label="Booked" value="12 h" trend="up" trendNote="2 h more than last week" />)

    expect(screen.getByText('Up')).toBeInTheDocument()
    expect(screen.getByText('2 h more than last week')).toBeInTheDocument()
  })

  it('spells out a fall and a flat week too', () => {
    const { rerender } = render(<StatTile label="Booked" value="4 h" trend="down" />)
    expect(screen.getByText('Down')).toBeInTheDocument()

    rerender(<StatTile label="Booked" value="4 h" trend="flat" />)
    expect(screen.getByText('No change')).toBeInTheDocument()
  })

  it('hides the trend arrow from assistive technology', () => {
    render(<StatTile label="Booked" value="12 h" trend="up" />)

    expect(screen.getByText('▲')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('group', { name: 'Booked' })).toHaveAccessibleName('Booked')
  })

  it('shows no trend at all when the direction is unknown', () => {
    render(<StatTile label="Booked" value="12 h" />)

    expect(screen.queryByText('No change')).not.toBeInTheDocument()
  })

  it('accepts a caller-chosen tone and extra class', () => {
    render(<StatTile label="Booked" value="12 h" trend="up" trendTone="ok" className="wide" />)

    expect(screen.getByRole('group', { name: 'Booked' })).toHaveClass('wide')
  })
})
