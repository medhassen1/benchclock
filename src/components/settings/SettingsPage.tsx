import { useId, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { DAY_NAMES } from '@/data/workshop'
import {
  GRID_DENSITIES,
  GRID_DENSITY_LABELS,
  usePreferences,
  type GridDensity,
} from '@/state/preferences-context'

import { ShortcutsDialog } from './ShortcutsDialog'
import styles from './SettingsPage.module.css'

const DENSITY_HINTS: Readonly<Record<GridDensity, string>> = {
  comfortable: 'Roomy rows, easier to hit on the workshop touchscreen.',
  compact: 'Thinner rows, so a whole day fits without scrolling.',
}

/**
 * Changes the preferences that follow a member around the app. Every group is
 * a real fieldset, so a screen reader announces which set of choices a control
 * belongs to before reading the choice itself.
 */
export function SettingsPage() {
  const { preferences, setPreference, reset } = usePreferences()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const baseId = useId()
  const densityName = `${baseId}-density`
  const firstDayId = `${baseId}-first-day`
  const unbookableHintId = `${baseId}-unbookable-hint`
  const densityHintId = (density: GridDensity) => `${baseId}-density-${density}`

  return (
    <div className={styles.root}>
      <header>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>
          These are saved on this terminal only, and change nothing about your bookings.
        </p>
      </header>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Grid density</legend>

        <div className={styles.choices}>
          {GRID_DENSITIES.map((density) => (
            // The hint sits outside the label: it describes the choice rather
            // than naming it, and would otherwise be read as part of the name.
            <div key={density} className={styles.choice}>
              <label className={styles.choiceLabel}>
                <input
                  type="radio"
                  name={densityName}
                  value={density}
                  checked={preferences.density === density}
                  aria-describedby={densityHintId(density)}
                  onChange={() => setPreference('density', density)}
                />
                <span>{GRID_DENSITY_LABELS[density]}</span>
              </label>
              <span id={densityHintId(density)} className={styles.hint}>
                {DENSITY_HINTS[density]}
              </span>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Machines on the board</legend>

        <div className={styles.choice}>
          <label className={styles.choiceLabel}>
            <input
              type="checkbox"
              checked={preferences.showUnbookable}
              aria-describedby={unbookableHintId}
              onChange={(event) => setPreference('showUnbookable', event.target.checked)}
            />
            <span>Show machines I cannot book</span>
          </label>
          <span id={unbookableHintId} className={styles.hint}>
            Off hides anything out of service or needing a sign-off you do not hold.
          </span>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Week start</legend>

        <label htmlFor={firstDayId} className={styles.selectLabel}>
          First day shown
        </label>
        <select
          id={firstDayId}
          className={styles.select}
          value={preferences.firstDay}
          // Select values are strings; the rest of the app counts days as
          // numbers from Monday, so convert on the way in.
          onChange={(event) => setPreference('firstDay', Number(event.target.value))}
        >
          {DAY_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </fieldset>

      <div className={styles.actions}>
        <Button onClick={() => setShortcutsOpen(true)}>Keyboard shortcuts</Button>
        <Button onClick={reset}>Reset to defaults</Button>
      </div>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
