import { describe, expect, it, vi } from 'vitest'

import { matchCommands, type Command } from '@/components/palette/commands'

const command = (id: string, label: string, keywords?: string[]): Command => ({
  id,
  label,
  keywords,
  run: vi.fn(),
})

const commands: readonly Command[] = [
  command('board', 'Booking board', ['grid', 'slots']),
  command('mine', 'My bookings', ['reservations', 'grid']),
  command('usage', 'Workshop usage', ['stats', 'report']),
  command('settings', 'Settings', ['preferences', 'density', 'board']),
  command('shortcuts', 'Keyboard shortcuts', ['help', 'keys']),
]

const ids = (query: string) => matchCommands(commands, query).map((entry) => entry.id)

describe('matchCommands', () => {
  it('keeps the authored order for an empty query', () => {
    expect(ids('')).toEqual(['board', 'mine', 'usage', 'settings', 'shortcuts'])
  })

  it('treats a whitespace-only query as empty', () => {
    expect(ids('   ')).toEqual(['board', 'mine', 'usage', 'settings', 'shortcuts'])
  })

  it('returns a copy rather than the caller’s array', () => {
    const result = matchCommands(commands, '')

    expect(result).not.toBe(commands)
    result.reverse()
    expect(commands[0].id).toBe('board')
  })

  it('matches on the label, case-insensitively', () => {
    expect(ids('WORKSHOP')).toEqual(['usage'])
  })

  it('matches on a hidden keyword', () => {
    expect(ids('reservations')).toEqual(['mine'])
  })

  it('drops commands that match nothing', () => {
    expect(ids('lathe')).toEqual([])
  })

  it('requires every term to match somewhere', () => {
    // "board" is in the label, "slots" only in the keywords: both count.
    expect(ids('board slots')).toEqual(['board'])
    expect(ids('board lathe')).toEqual([])
  })

  it('lets terms match across label and keywords in any order', () => {
    expect(ids('slots booking')).toEqual(['board'])
  })

  it('ranks a label prefix above a mid-label hit', () => {
    // "Booking board" starts with the term; "My bookings" carries it mid-label.
    expect(ids('booking')).toEqual(['board', 'mine'])
  })

  it('ranks a mid-label hit above a keyword-only hit', () => {
    // "board" sits mid-label in two commands and is only a hidden keyword on
    // settings, which therefore comes last.
    expect(ids('board')).toEqual(['board', 'shortcuts', 'settings'])
  })

  it('ranks by the weakest term of a multi-word query', () => {
    const list = [
      command('a', 'Grid density', ['settings']),
      command('b', 'Settings', ['grid', 'density']),
    ]

    // Both need a keyword to complete the query, so authored order decides.
    expect(matchCommands(list, 'settings density').map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('keeps the authored order for equally ranked matches', () => {
    const list = [
      command('first', 'Book the laser'),
      command('second', 'Book the lathe'),
      command('third', 'Book the router'),
    ]

    expect(matchCommands(list, 'book').map((entry) => entry.id)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('ignores repeated whitespace between terms', () => {
    expect(ids('  keyboard   shortcuts ')).toEqual(['shortcuts'])
  })

  it('matches a partial word', () => {
    expect(ids('short')).toEqual(['shortcuts'])
  })

  it('handles commands without keywords', () => {
    const list = [command('plain', 'Sign out')]

    expect(matchCommands(list, 'sign').map((entry) => entry.id)).toEqual(['plain'])
    expect(matchCommands(list, 'nope')).toEqual([])
  })

  it('keeps disabled commands in the results so they can be explained', () => {
    const list: Command[] = [{ id: 'cancel', label: 'Cancel booking', disabled: true, run: vi.fn() }]

    expect(matchCommands(list, 'cancel')).toHaveLength(1)
  })

  it('leaves an empty command list empty', () => {
    expect(matchCommands([], 'anything')).toEqual([])
    expect(matchCommands([], '')).toEqual([])
  })
})
