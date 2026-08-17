import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

import styles from './ShortcutsDialog.module.css'

export interface Shortcut {
  /** The keys held together, in the order they are shown. */
  keys: readonly string[]
  description: string
}

export interface ShortcutGroup {
  name: string
  shortcuts: readonly Shortcut[]
}

/**
 * Every shortcut the app binds, grouped by where it works. Kept as data so
 * the help stays a single list to update when a binding changes.
 */
const APP_SHORTCUTS: readonly ShortcutGroup[] = [
  {
    name: 'Anywhere',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Open the command palette' },
      { keys: ['?'], description: 'Show this list of shortcuts' },
    ],
  },
  {
    name: 'Command palette',
    shortcuts: [
      { keys: ['Up'], description: 'Highlight the command above, wrapping to the last' },
      { keys: ['Down'], description: 'Highlight the command below, wrapping to the first' },
      { keys: ['Home'], description: 'Jump to the first command' },
      { keys: ['End'], description: 'Jump to the last command' },
      { keys: ['Enter'], description: 'Run the highlighted command' },
      { keys: ['Esc'], description: 'Close the palette and go back' },
    ],
  },
  {
    name: 'Booking board',
    shortcuts: [
      { keys: ['Arrows'], description: 'Move between slots' },
      { keys: ['Enter'], description: 'Book the focused slot, or open the booking on it' },
      { keys: ['Home'], description: 'Jump to opening time' },
      { keys: ['End'], description: 'Jump to closing time' },
      { keys: ['Ctrl', 'Home'], description: 'Jump to the first machine of the day' },
    ],
  },
]

export interface ShortcutsDialogProps {
  open: boolean
  onClose: () => void
  /** Overridable so a page can document only the shortcuts it binds. */
  groups?: readonly ShortcutGroup[]
}

/** The keyboard help, as a definition list of combination against effect. */
export function ShortcutsDialog({ open, onClose, groups = APP_SHORTCUTS }: ShortcutsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Everything on the board can be reached without a mouse."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {groups.map((group) => (
        <section key={group.name} className={styles.group}>
          <h3 className={styles.groupName}>{group.name}</h3>

          <dl className={styles.list}>
            {group.shortcuts.map((shortcut) => (
              <div key={shortcut.description} className={styles.row}>
                <dt className={styles.keys}>
                  {shortcut.keys.map((key, index) => (
                    <span key={`${key}-${index}`}>
                      {/* Decoration only: a reader announces "Ctrl K" as it is. */}
                      {index > 0 ? (
                        <span aria-hidden="true" className={styles.plus}>
                          +
                        </span>
                      ) : null}
                      <kbd className={styles.key}>{key}</kbd>
                    </span>
                  ))}
                </dt>
                <dd className={styles.description}>{shortcut.description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p className={styles.note}>On a Mac, press Cmd wherever Ctrl is listed.</p>
    </Dialog>
  )
}
