import { createContext, useContext } from 'react'

/** How much room a grid cell gets; compact fits a whole day on a laptop. */
export type GridDensity = 'comfortable' | 'compact'

export interface Preferences {
  density: GridDensity
  /** Keeps machines the member has no sign-off for on the board. */
  showUnbookable: boolean
  /** 0 = Monday … 6 = Sunday: the day the board opens on. */
  firstDay: number
}

/** Bumped when the shape changes, so an old value is dropped, not patched. */
export const PREFERENCES_KEY = 'benchclock:prefs:v1'

export const GRID_DENSITIES: readonly GridDensity[] = ['comfortable', 'compact']

export const GRID_DENSITY_LABELS: Readonly<Record<GridDensity, string>> = {
  comfortable: 'Comfortable',
  compact: 'Compact',
}

export const DEFAULT_PREFERENCES: Preferences = {
  density: 'comfortable',
  showUnbookable: true,
  firstDay: 0,
}

export interface PreferencesContextValue {
  preferences: Preferences
  /** Changes one setting, leaving the others alone. */
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  reset: () => void
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error('usePreferences must be used inside a <PreferencesProvider>')
  }
  return context
}
