import { useId, type ReactNode } from 'react'
import { NavLink, type NavLinkRenderProps } from 'react-router-dom'

import { MEMBERS } from '@/data/workshop'
import { allowanceUsage } from '@/lib/rules'
import { formatDuration } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'

import { AppCommands } from './AppCommands'
import styles from './AppShell.module.css'

/** Grouped so the sidebar stays readable as the app grew past a dozen pages. */
const NAV_GROUPS = [
  {
    title: 'Booking',
    items: [
      { to: '/', label: 'Board', icon: '▦', end: true },
      { to: '/bookings', label: 'My bookings', icon: '☰', end: false },
      { to: '/series', label: 'Repeats', icon: '↻', end: false },
      { to: '/waitlist', label: 'Waiting for', icon: '⋯', end: false },
    ],
  },
  {
    title: 'Workshop',
    items: [
      { to: '/inductions', label: 'Inductions', icon: '✦', end: false },
      { to: '/maintenance', label: 'Maintenance', icon: '⚒', end: false },
      { to: '/stock', label: 'Stock', icon: '▤', end: false },
    ],
  },
  {
    title: 'Insight',
    items: [
      { to: '/usage', label: 'Usage', icon: '◔', end: false },
      { to: '/reports', label: 'Reports', icon: '▩', end: false },
      { to: '/audit', label: 'Activity', icon: '≡', end: false },
    ],
  },
  {
    title: 'Manage',
    items: [
      { to: '/data', label: 'Import & export', icon: '⇄', end: false },
      { to: '/admin', label: 'Admin', icon: '⚙', end: false },
      { to: '/settings', label: 'Settings', icon: '◇', end: false },
    ],
  },
] as const

function navClass({ isActive }: NavLinkRenderProps): string {
  return isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
}

export function AppShell({ children }: { children: ReactNode }) {
  const { member, setMemberId } = useSession()
  const { bookings } = useBoard()
  const selectId = useId()

  const usage = allowanceUsage(member, bookings)

  return (
    <div className={styles.root}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            ◈
          </span>
          <span className={styles.brandName}>Benchclock</span>
          <span className={styles.brandNote}>Workshop booking board</span>
        </div>

        <div className={styles.headerEnd}>
          <p className={styles.paletteHint}>
            Press <kbd className={styles.kbd}>Ctrl</kbd>
            <kbd className={styles.kbd}>K</kbd>
          </p>

          <p className={styles.allowance}>
            <span className="visually-hidden">Weekly allowance remaining: </span>
            {formatDuration(usage.remaining)} left of {formatDuration(usage.allowance)}
          </p>

          <div className={styles.memberPicker}>
            <label htmlFor={selectId} className={styles.memberLabel}>
              Signed in as
            </label>
            <select
              id={selectId}
              className={styles.select}
              value={member.id}
              onChange={(event) => setMemberId(event.target.value)}
            >
              {MEMBERS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <h2 className={styles.navTitle} id={`nav-${group.title.toLowerCase()}`}>
                {group.title}
              </h2>
              <ul
                className={styles.navList}
                aria-labelledby={`nav-${group.title.toLowerCase()}`}
              >
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} className={navClass}>
                      <span className={styles.navIcon} aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>

      <AppCommands />
    </div>
  )
}
