import { useCallback, useMemo, type ReactNode } from 'react'

import { DAY_NAMES } from '@/data/workshop'
import { usePersistentState } from '@/hooks/usePersistentState'

import {
  DEFAULT_PREFERENCES,
  GRID_DENSITIES,
  PREFERENCES_KEY,
  PreferencesContext,
  type GridDensity,
  type Preferences,
} from './preferences-context'

function isDensity(raw: unknown): raw is GridDensity {
  return typeof raw === 'string' && GRID_DENSITIES.includes(raw as GridDensity)
}

function isDayIndex(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < DAY_NAMES.length
}

/**
 * Reads a stored preference set field by field. One setting written by an
 * older build, or edited by hand in devtools, falls back on its own instead
 * of throwing away the settings next to it.
 */
function parsePreferences(raw: unknown): Preferences | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const value = raw as Record<string, unknown>

  return {
    density: isDensity(value.density) ? value.density : DEFAULT_PREFERENCES.density,
    showUnbookable:
      typeof value.showUnbookable === 'boolean'
        ? value.showUnbookable
        : DEFAULT_PREFERENCES.showUnbookable,
    firstDay: isDayIndex(value.firstDay) ? value.firstDay : DEFAULT_PREFERENCES.firstDay,
  }
}

/**
 * Holds the UI preferences that outlive a visit. They describe the view only,
 * never a booking, so a corrupt value costs a member nothing beyond a reset.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = usePersistentState<Preferences>(
    PREFERENCES_KEY,
    DEFAULT_PREFERENCES,
    parsePreferences,
  )

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPreferences((current) => ({ ...current, [key]: value }))
    },
    [setPreferences],
  )

  const reset = useCallback(() => setPreferences(DEFAULT_PREFERENCES), [setPreferences])

  const value = useMemo(
    () => ({ preferences, setPreference, reset }),
    [preferences, setPreference, reset],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
