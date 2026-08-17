import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ServiceLogList } from '@/components/maintenance/ServiceLogList'
import type { ServiceLogEntry } from '@/data/maintenance'
import { weekMinute } from '@/lib/weektime'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

function entry(over: Partial<ServiceLogEntry> = {}): ServiceLogEntry {
  return {
    id: 'svc-0001',
    machineId: 'laser-a',
    memberId: 'm-ilra',
    kind: 'service',
    notes: 'Cleaned the lens and re-aligned the mirrors',
    minute: at(1, 19),
    runMinutesAtService: 1200,
    recordedAt: 1,
    ...over,
  }
}

describe('ServiceLogList', () => {
  it('says the log is empty rather than showing an empty list', () => {
    render(<ServiceLogList entries={[]} />)

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(/No services recorded yet/)).toBeInTheDocument()
  })

  it('shows the machine, what was done, when, and who did it', () => {
    render(<ServiceLogList entries={[entry()]} />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText('Big laser')).toBeInTheDocument()
    expect(within(item).getByText('Routine service')).toBeInTheDocument()
    expect(within(item).getByText('Tue 19:00')).toBeInTheDocument()
    expect(within(item).getByText(/Cleaned the lens/)).toBeInTheDocument()
    expect(within(item).getByText('Signed off by Ilra Diagana')).toBeInTheDocument()
  })

  it('keeps the order it is given, newest first', () => {
    render(
      <ServiceLogList
        entries={[
          entry({ id: 'svc-0002', notes: 'Newest', recordedAt: 2 }),
          entry({ id: 'svc-0001', notes: 'Oldest', recordedAt: 1 }),
        ]}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Newest')
    expect(items[1]).toHaveTextContent('Oldest')
  })

  it('names the list so a screen reader can find it', () => {
    render(<ServiceLogList entries={[entry()]} label="Big laser services" />)

    expect(screen.getByRole('list', { name: 'Big laser services' })).toBeInTheDocument()
  })

  it('labels the kind of work in words', () => {
    render(<ServiceLogList entries={[entry({ kind: 'repair' })]} />)

    expect(screen.getByText('Repair')).toBeInTheDocument()
  })

  it('stays readable when the machine or member has left the workshop', () => {
    render(<ServiceLogList entries={[entry({ machineId: 'ghost-a', memberId: 'm-gone' })]} />)

    expect(screen.getByText('Unknown machine')).toBeInTheDocument()
    expect(screen.getByText('Signed off by a former member')).toBeInTheDocument()
  })
})
