import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DataPage } from '@/components/data/DataPage'
import { configureLatency, resetIdCounter } from '@/lib/api'
import { AUDIT_STORAGE_KEY, type AuditEntry } from '@/lib/audit'
import { weekMinute } from '@/lib/weektime'
import { AuditProvider } from '@/state/AuditProvider'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { Booking } from '@/types'

const at = (day: number, hour: number, minute = 0) => weekMinute(day, hour * 60 + minute)

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk-0001',
  machineId: 'laser-a',
  memberId: 'm-ilra',
  startMinute: at(0, 18),
  endMinute: at(0, 19),
  note: '',
  createdAt: 1,
  ...over,
})

function seed(bookings: Booking[]) {
  window.localStorage.setItem('benchclock:bookings:v1', JSON.stringify(bookings))
}

function trail(): AuditEntry[] {
  return JSON.parse(window.localStorage.getItem(AUDIT_STORAGE_KEY) ?? '[]') as AuditEntry[]
}

const renderPage = ({ withAudit = true } = {}) =>
  renderWithProviders(withAudit ? <AuditProvider><DataPage /></AuditProvider> : <DataPage />, {
    route: '/data',
  })

const exportField = () => screen.getByLabelText('Bookings as CSV') as HTMLTextAreaElement
const importField = () => screen.getByLabelText('Paste CSV to import') as HTMLTextAreaElement

async function pasteCsv(text: string) {
  const field = importField()
  await userEvent.click(field)
  await userEvent.paste(text)
}

beforeEach(() => {
  configureLatency(0)
  resetIdCounter()
})

afterEach(() => {
  configureLatency()
})

describe('DataPage export', () => {
  it('renders the board as CSV in a read-only field', () => {
    seed([booking({ note: 'Lamp base' })])
    renderPage()

    const field = exportField()
    expect(field).toHaveAttribute('readonly')
    expect(field.value).toContain('machineId,machine,memberId,member,day,start,end,note')
    expect(field.value).toContain(
      'laser-a,Big laser,m-ilra,Ilra Diagana,Monday,18:00,19:00,Lamp base',
    )
  })

  it('quotes a note that would otherwise break the row', () => {
    seed([booking({ note: 'panel, "final"' })])
    renderPage()

    expect(exportField().value).toContain('"panel, ""final"""')
  })

  it('explains an empty board rather than showing an empty box', () => {
    renderPage()

    expect(exportField().value.trim()).toBe(
      'machineId,machine,memberId,member,day,start,end,note',
    )
    expect(screen.getByText(/only the header row/)).toBeInTheDocument()
  })

  it('counts what is on the board', () => {
    seed([
      booking({ id: 'bk-1' }),
      booking({ id: 'bk-2', startMinute: at(1, 18), endMinute: at(1, 19) }),
    ])
    renderPage()

    expect(screen.getByText(/2 bookings on the board/)).toBeInTheDocument()
  })

  it('selects the CSV and announces the copy', async () => {
    seed([booking()])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))

    const field = exportField()
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(field.value.length)
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Export status' })).toHaveTextContent(/copy/i),
    )
  })

  it('logs the export to the audit trail', async () => {
    seed([booking()])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))

    await waitFor(() => expect(trail()).toHaveLength(1))
    expect(trail()[0]).toMatchObject({
      actorId: 'm-ilra',
      action: 'bookings-exported',
      subject: 'CSV',
      details: '1 booking',
    })
  })

  it('exports without an audit trail mounted', async () => {
    seed([booking()])
    renderPage({ withAudit: false })

    await userEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))

    expect(trail()).toEqual([])
    expect(exportField().value).toContain('laser-a')
  })
})

describe('DataPage import', () => {
  const goodRow = 'laser-a,m-ilra,Monday,18:00,19:00,Lamp base'
  const headerRow = 'machineId,memberId,day,start,end,note'

  it('previews the rows it understands', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\n${goodRow}`)

    const row = screen.getByRole('row', { name: /Big laser/ })
    expect(row).toHaveTextContent('Ilra Diagana')
    expect(row).toHaveTextContent('Mon 18:00 – 19:00')
    expect(row).toHaveTextContent('1 h')
    expect(row).toHaveTextContent('Lamp base')
  })

  it('offers to import exactly what it previewed', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\n${goodRow}\nlaser-b,m-ilra,Tuesday,18:00,19:00,`)

    expect(screen.getByRole('button', { name: 'Import 2 bookings' })).toBeEnabled()
  })

  it('has nothing to import until something valid is pasted', () => {
    renderPage()

    expect(screen.getByRole('button', { name: 'Import bookings' })).toBeDisabled()
  })

  it('lists a problem per row and marks the field invalid', async () => {
    renderPage()
    await pasteCsv(
      `${headerRow}\nnope-a,m-ilra,Monday,18:00,19:00,\nlaser-a,m-ilra,Funday,18:00,19:00,`,
    )

    expect(importField()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/Unknown machine/)).toBeInTheDocument()
    expect(screen.getByText(/Unknown day/)).toBeInTheDocument()
    expect(screen.getByText('Line 2, machine:')).toBeInTheDocument()
    expect(screen.getByText('Line 3, day:')).toBeInTheDocument()
    expect(screen.getByText('2 row problems')).toBeInTheDocument()
  })

  it('describes the field with its hint and its errors', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\nnope-a,m-ilra,Monday,18:00,19:00,`)

    const field = importField()
    expect(field).toHaveAttribute('aria-describedby', 'import-hint import-errors')
    expect(document.getElementById('import-hint')).toHaveTextContent('Columns: machineId')
    expect(document.getElementById('import-errors')).toHaveTextContent('Unknown machine')
  })

  it('previews the good rows even when a neighbour is broken', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\nnope-a,m-ilra,Monday,18:00,19:00,\n${goodRow}`)

    expect(screen.getByRole('row', { name: /Big laser/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 1 booking' })).toBeEnabled()
  })

  it('puts the imported bookings on the board and clears the box', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\n${goodRow}`)
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 booking' }))

    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Import status' })).toHaveTextContent(
        'Imported 1 booking.',
      ),
    )
    expect(importField().value).toBe('')
    expect(exportField().value).toContain('Lamp base')
  })

  it('lists the rows the board refused and keeps the paste for fixing', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\nlaser-a,m-ilra,Monday,03:00,04:00,\n${goodRow}`)
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 bookings' }))

    const status = await screen.findByRole('status', { name: 'Import status' })
    await waitFor(() => expect(status).toHaveTextContent('Imported 1 of 2 rows; 1 refused.'))
    expect(status).toHaveTextContent('Big laser · Mon 03:00')
    expect(status).toHaveTextContent(/workshop is closed/)
    expect(importField().value).not.toBe('')
  })

  it('refuses a second row that clashes with the first one imported', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\n${goodRow}\nlaser-a,m-ilra,Monday,18:30,19:30,Clash`)
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 bookings' }))

    const status = await screen.findByRole('status', { name: 'Import status' })
    await waitFor(() => expect(status).toHaveTextContent('Imported 1 of 2 rows; 1 refused.'))
    expect(status).toHaveTextContent(/already booked/)
  })

  it('logs the import to the audit trail', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\n${goodRow}`)
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 booking' }))

    await waitFor(() => expect(trail()).toHaveLength(1))
    expect(trail()[0]).toMatchObject({
      actorId: 'm-ilra',
      action: 'bookings-imported',
      subject: 'CSV',
      details: '1 of 1 row',
    })
  })

  it('imports without an audit trail mounted', async () => {
    renderPage({ withAudit: false })
    await pasteCsv(`${headerRow}\n${goodRow}`)
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 booking' }))

    await waitFor(() => expect(exportField().value).toContain('Lamp base'))
    expect(trail()).toEqual([])
  })

  it('drops the last result as soon as the paste is edited', async () => {
    renderPage()
    await pasteCsv(`${headerRow}\n${goodRow}`)
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 booking' }))

    const status = await screen.findByRole('status', { name: 'Import status' })
    await waitFor(() => expect(status).toHaveTextContent('Imported 1 booking.'))

    await pasteCsv(headerRow)

    expect(status.textContent).toBe('')
  })

  it('round-trips what it exported', async () => {
    seed([booking({ note: 'panel, "final"' })])
    renderPage()

    const exported = exportField().value
    window.localStorage.setItem('benchclock:bookings:v1', '[]')
    await pasteCsv(exported)

    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('row', { name: /Big laser/ })).toHaveTextContent('panel, "final"')
  })
})
