import { useId, type ReactNode } from 'react'
import { NavLink, type NavLinkRenderProps } from 'react-router-dom'

import { MEMBERS } from '@/data/workshop'
import { allowanceUsage } from '@/lib/rules'
import { formatDuration } from '@/lib/weektime'
import { useBoard } from '@/state/board-context'
import { useSession } from '@/state/session-context'

import styles from './AppShell.module.css'

const NAV_ITEMS = [
  { to: '/', label: 'Board', icon: '▦', end: true },
  { to: '/bookings', label: 'My bookings', icon: '☰', end: false },
  { to: '/usage', label: 'Usage', icon: '◔', end: false },
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
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => (
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
        </nav>

        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
