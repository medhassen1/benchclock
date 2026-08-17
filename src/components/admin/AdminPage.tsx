import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { MachineEditor } from '@/components/admin/MachineEditor'
import { OpeningHoursEditor } from '@/components/admin/OpeningHoursEditor'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { MACHINES_BY_ID, MACHINE_KIND_LABELS, TICKET_LABELS } from '@/data/workshop'
import { formatDuration } from '@/lib/weektime'
import { dayDraftsFrom, EMPTY_OVERRIDES } from '@/lib/workshopConfig'
import { useSession } from '@/state/session-context'
import { useWorkshopConfig } from '@/state/workshop-config-context'
import type { MembershipTier } from '@/types'

import styles from './AdminPage.module.css'

type TabId = 'machines' | 'hours' | 'members'

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'machines', label: 'Machines' },
  { id: 'hours', label: 'Opening hours' },
  { id: 'members', label: 'Members' },
]

const TIER_LABELS: Readonly<Record<MembershipTier, string>> = {
  casual: 'Casual',
  regular: 'Regular',
  keyholder: 'Keyholder',
}

/** The shipped week, so the hours editor can put the defaults back. */
const DEFAULT_DAY_DRAFTS = dayDraftsFrom(EMPTY_OVERRIDES)

/**
 * Workshop administration. Only keyholders may change the settings the rest
 * of the board runs on, so a member on any other tier is told plainly that
 * they need keyholder access instead of being shown disabled controls.
 */
export function AdminPage() {
  const { member } = useSession()
  const config = useWorkshopConfig()
  const [tab, setTab] = useState<TabId>('machines')
  const [selectedId, setSelectedId] = useState(config.machines[0]?.id ?? '')
  const [confirmingReset, setConfirmingReset] = useState(false)
  // Bumped when everything is restored, so both editors remount on the
  // defaults rather than keeping the half-typed values in their own state.
  const [resetToken, setResetToken] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const dayDrafts = useMemo(() => dayDraftsFrom(config.overrides), [config.overrides])
  const changedCount =
    Object.keys(config.overrides.machines).length +
    Object.keys(config.overrides.members).length +
    Object.keys(config.overrides.days).length
  const hoursChanged = Object.keys(config.overrides.days).length > 0

  if (member.tier !== 'keyholder') {
    return (
      <div className={styles.root}>
        <header>
          <h1 className={styles.title}>Workshop settings</h1>
        </header>

        <section className={styles.locked} aria-labelledby="admin-locked">
          <span className={styles.lockMark} aria-hidden="true">
            ⚿
          </span>
          <h2 id="admin-locked" className={styles.lockedHeading}>
            You need keyholder access
          </h2>
          <p className={styles.lockedBody}>
            Machines, opening hours, and member records can only be changed by a keyholder. You are
            signed in as {member.name}, a {TIER_LABELS[member.tier].toLowerCase()} member.
          </p>
          <p className={styles.lockedBody}>
            Ask a keyholder to make the change, or to upgrade your membership.
          </p>
        </section>
      </div>
    )
  }

  const selected = config.machineById.get(selectedId) ?? config.machines[0]
  // Falls back to the effective machine if the fixtures ever lose this id.
  const selectedDefaults = selected ? (MACHINES_BY_ID.get(selected.id) ?? selected) : undefined

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1
    let next = index

    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else return

    event.preventDefault()
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Workshop settings</h1>
          <p className={styles.subtitle}>
            {changedCount === 0
              ? 'Everything is on the settings the workshop shipped with.'
              : `${changedCount} ${changedCount === 1 ? 'setting has' : 'settings have'} been changed from the defaults.`}
          </p>
        </div>

        <div className={styles.headerSide}>
          <Badge tone="accent" icon="⚿">
            Keyholder
          </Badge>
          <Button
            variant="danger"
            disabled={!config.customised}
            onClick={() => setConfirmingReset(true)}
          >
            Restore all defaults
          </Button>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Workshop settings sections">
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            type="button"
            role="tab"
            id={`admin-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`admin-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            className={tab === entry.id ? styles.tabSelected : styles.tab}
            onClick={() => setTab(entry.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'machines' ? (
        <section
          id="admin-panel-machines"
          role="tabpanel"
          aria-labelledby="admin-tab-machines"
          tabIndex={0}
          className={styles.panel}
        >
          <div className={styles.picker}>
            <label className={styles.pickerLabel} htmlFor="admin-machine">
              Machine to edit
            </label>
            <select
              id="admin-machine"
              className={styles.select}
              value={selected?.id ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {config.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name} · {MACHINE_KIND_LABELS[machine.kind]}
                  {machine.outOfService ? ' · out of service' : ''}
                </option>
              ))}
            </select>
          </div>

          {selected ? (
            <MachineEditor
              key={`${selected.id}-${resetToken}`}
              machine={selected}
              defaults={selectedDefaults ?? selected}
              onSave={(draft) => config.updateMachine(selected.id, draft)}
              onReset={() => config.resetMachine(selected.id)}
            />
          ) : null}
        </section>
      ) : null}

      {tab === 'hours' ? (
        <section
          id="admin-panel-hours"
          role="tabpanel"
          aria-labelledby="admin-tab-hours"
          tabIndex={0}
          className={styles.panel}
        >
          <OpeningHoursEditor
            key={`hours-${resetToken}`}
            drafts={dayDrafts}
            defaults={DEFAULT_DAY_DRAFTS}
            onSave={config.updateDays}
            onReset={config.resetHours}
            changed={hoursChanged}
          />
        </section>
      ) : null}

      {tab === 'members' ? (
        <section
          id="admin-panel-members"
          role="tabpanel"
          aria-labelledby="admin-tab-members"
          tabIndex={0}
          className={styles.panel}
        >
          <table className={styles.table}>
            <caption className={styles.caption}>
              Members and the time each tier may book in a week. Sign-offs are recorded at
              induction.
            </caption>
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Tier</th>
                <th scope="col">Weekly allowance</th>
                <th scope="col">Sign-offs</th>
              </tr>
            </thead>
            <tbody>
              {config.members.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row" className={styles.memberCell}>
                    {entry.name}
                    {entry.id === member.id ? <Badge tone="accent">You</Badge> : null}
                  </th>
                  <td className={styles.muted}>{TIER_LABELS[entry.tier]}</td>
                  <td className={styles.numeric}>{formatDuration(entry.weeklyMinuteAllowance)}</td>
                  <td className={styles.muted}>
                    {entry.tickets.length > 0
                      ? entry.tickets.map((ticket) => TICKET_LABELS[ticket]).join(', ')
                      : 'None yet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <Dialog
        open={confirmingReset}
        onClose={() => setConfirmingReset(false)}
        title="Restore all the default settings?"
        description="Machines, members, and opening hours go back to what the workshop shipped with."
        footer={
          <>
            <Button onClick={() => setConfirmingReset(false)}>Keep my changes</Button>
            <Button
              variant="danger"
              onClick={() => {
                config.resetAll()
                setResetToken((token) => token + 1)
                setConfirmingReset(false)
              }}
            >
              Restore all defaults
            </Button>
          </>
        }
      >
        <p>Bookings already on the board are left alone.</p>
      </Dialog>
    </div>
  )
}
