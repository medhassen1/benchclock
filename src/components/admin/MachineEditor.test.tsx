import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MachineEditor } from '@/components/admin/MachineEditor'
import { MACHINES } from '@/data/workshop'
import { validateMachineDraft, type MachineDraft } from '@/lib/workshopConfig'
import type { Machine } from '@/types'

const laser = MACHINES[0]

/** Saves through the real validator, so the wiring is tested end to end. */
function setup(machine: Machine = laser, defaults: Machine = laser) {
  const onSave = vi.fn((draft: MachineDraft) => validateMachineDraft(draft))
  const onReset = vi.fn()

  render(
    <MachineEditor machine={machine} defaults={defaults} onSave={onSave} onReset={onReset} />,
  )

  return { onSave, onReset }
}

const field = (name: RegExp | string) => screen.getByLabelText(name)

async function retype(name: RegExp | string, value: string) {
  const input = field(name)
  await userEvent.clear(input)
  if (value !== '') await userEvent.type(input, value)
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save machine' }))

describe('MachineEditor', () => {
  it('shows the machine values in labelled inputs', () => {
    setup()

    expect(field('Machine name')).toHaveValue('Big laser')
    expect(field('Longest booking (minutes)')).toHaveValue('120')
    expect(field('Cool-down (minutes)')).toHaveValue('30')
    expect(field('Location')).toHaveValue('Bay 1')
    expect(field('Required sign-off')).toHaveValue('laser-basic')
    expect(field('Out of service')).not.toBeChecked()
  })

  it('saves an edited machine', async () => {
    const { onSave } = setup()

    await retype('Machine name', 'Huge laser')
    await retype('Longest booking (minutes)', '90')
    await retype('Cool-down (minutes)', '0')
    await save()

    expect(onSave).toHaveBeenCalledWith({
      name: 'Huge laser',
      requiredTicket: 'laser-basic',
      maxSessionMinutes: 90,
      cooldownMinutes: 0,
      location: 'Bay 1',
      outOfService: false,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
  })

  it('can drop the required sign-off', async () => {
    const { onSave } = setup()

    await userEvent.selectOptions(field('Required sign-off'), 'none')
    await save()

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ requiredTicket: null }))
  })

  it('marks a machine out of service and says so in words', async () => {
    const { onSave } = setup()

    expect(screen.getByText(/In service: members with the right sign-off/)).toBeInTheDocument()

    await userEvent.click(field('Out of service'))
    expect(screen.getByText(/Out of service: nobody can book this machine/)).toBeInTheDocument()

    await save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ outOfService: true }))
  })

  it('refuses a zero-length session and ties the message to the input', async () => {
    setup()

    await retype('Longest booking (minutes)', '0')
    await save()

    const input = field('Longest booking (minutes)')
    const error = screen.getByRole('alert')

    expect(error).toHaveTextContent('The longest session must be more than zero minutes.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
  })

  it('refuses a negative session length', async () => {
    setup()

    await retype('Longest booking (minutes)', '-60')
    await save()

    expect(screen.getByRole('alert')).toHaveTextContent('must be more than zero minutes')
  })

  it('refuses a session length that is not a whole number of slots', async () => {
    setup()

    await retype('Longest booking (minutes)', '45')
    await save()

    expect(screen.getByRole('alert')).toHaveTextContent('must be a multiple of 30 minutes')
  })

  it('refuses a session length left empty', async () => {
    setup()

    await retype('Longest booking (minutes)', '')
    await save()

    expect(screen.getByRole('alert')).toHaveTextContent('whole number of minutes')
  })

  it('refuses a negative cool-down and points at the cool-down input', async () => {
    setup()

    await retype('Cool-down (minutes)', '-15')
    await save()

    const input = field('Cool-down (minutes)')
    const error = screen.getByRole('alert')

    expect(error).toHaveTextContent('The cool-down cannot be negative.')
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
    expect(field('Longest booking (minutes)')).not.toHaveAttribute('aria-invalid')
  })

  it('refuses a blank name', async () => {
    setup()

    await retype('Machine name', '   ')
    await save()

    expect(screen.getByRole('alert')).toHaveTextContent('Give the machine a name.')
  })

  it('shows every broken field at once', async () => {
    setup()

    await retype('Machine name', '')
    await retype('Longest booking (minutes)', '7')
    await retype('Cool-down (minutes)', '-1')
    await save()

    expect(screen.getAllByRole('alert')).toHaveLength(3)
  })

  it('clears the errors once the edit is fixed', async () => {
    setup()

    await retype('Longest booking (minutes)', '0')
    await save()
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    await retype('Longest booking (minutes)', '60')
    await save()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(field('Longest booking (minutes)')).not.toHaveAttribute('aria-invalid')
  })

  it('says in words when a machine differs from the shipped default', () => {
    setup({ ...laser, maxSessionMinutes: 60 })

    expect(screen.getByText('Changed from the default')).toBeInTheDocument()
  })

  it('says when a machine is still on its default settings', () => {
    setup()

    expect(screen.getByText('Default settings')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore defaults' })).toBeDisabled()
  })

  it('restores the shipped values', async () => {
    const { onReset } = setup({ ...laser, name: 'Huge laser', maxSessionMinutes: 60 })

    await userEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))

    expect(onReset).toHaveBeenCalledTimes(1)
    expect(field('Machine name')).toHaveValue('Big laser')
    expect(field('Longest booking (minutes)')).toHaveValue('120')
  })

  it('drops the saved confirmation as soon as the form is edited again', async () => {
    setup()

    await save()
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')

    await userEvent.type(field('Location'), '!')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
