import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PreferencesProvider } from '@/state/PreferencesProvider'
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  usePreferences,
} from '@/state/preferences-context'

const wrapper = ({ children }: { children: ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
)

const renderPreferences = () => renderHook(() => usePreferences(), { wrapper })

/** Whatever is in storage under the preferences key, already parsed. */
const stored = () => JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? 'null')

const store = (value: unknown) =>
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value))

describe('PreferencesProvider', () => {
  it('starts from the defaults', () => {
    const { result } = renderPreferences()

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('changes one setting without touching the others', () => {
    const { result } = renderPreferences()

    act(() => result.current.setPreference('density', 'compact'))

    expect(result.current.preferences).toEqual({ ...DEFAULT_PREFERENCES, density: 'compact' })
  })

  it('writes to localStorage under the versioned key', async () => {
    const { result } = renderPreferences()

    act(() => result.current.setPreference('firstDay', 5))

    await waitFor(() => expect(stored()).toMatchObject({ firstDay: 5 }))
  })

  it('reads a stored set back on the next visit', async () => {
    const first = renderPreferences()
    act(() => first.result.current.setPreference('showUnbookable', false))
    first.unmount()

    const second = renderPreferences()

    await waitFor(() => expect(second.result.current.preferences.showUnbookable).toBe(false))
  })

  it('accepts a stored set that matches the schema', () => {
    store({ density: 'compact', showUnbookable: false, firstDay: 3 })

    const { result } = renderPreferences()

    expect(result.current.preferences).toEqual({
      density: 'compact',
      showUnbookable: false,
      firstDay: 3,
    })
  })

  it('replaces only the fields it does not recognise', () => {
    store({ density: 'roomy', showUnbookable: false, firstDay: 2 })

    const { result } = renderPreferences()

    expect(result.current.preferences).toEqual({
      density: 'comfortable',
      showUnbookable: false,
      firstDay: 2,
    })
  })

  it('fills in fields that are missing entirely', () => {
    store({ firstDay: 6 })

    const { result } = renderPreferences()

    expect(result.current.preferences).toEqual({ ...DEFAULT_PREFERENCES, firstDay: 6 })
  })

  it('refuses a first day outside the week', () => {
    for (const firstDay of [-1, 7, 1.5, '2', null]) {
      window.localStorage.clear()
      store({ firstDay })

      const { result, unmount } = renderPreferences()

      expect(result.current.preferences.firstDay).toBe(DEFAULT_PREFERENCES.firstDay)
      unmount()
    }
  })

  it('refuses a stored value that is not an object', () => {
    for (const raw of ['compact', 42, true, ['compact']]) {
      window.localStorage.clear()
      store(raw)

      const { result, unmount } = renderPreferences()

      expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES)
      unmount()
    }
  })

  it('survives a stored value that is not JSON at all', () => {
    window.localStorage.setItem(PREFERENCES_KEY, 'not json')

    const { result } = renderPreferences()

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('puts everything back with a reset', () => {
    const { result } = renderPreferences()

    act(() => result.current.setPreference('density', 'compact'))
    act(() => result.current.setPreference('showUnbookable', false))
    act(() => result.current.reset())

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => usePreferences())).toThrow(
      /usePreferences must be used inside a <PreferencesProvider>/,
    )
  })
})
