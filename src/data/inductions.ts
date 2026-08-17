import { MINUTES_PER_DAY } from '@/data/workshop'
import type { Ticket } from '@/types'

/**
 * A scheduled training session. Passing it grants exactly one sign-off, which
 * is what unlocks the machines that require that ticket.
 *
 * Times are minutes from Monday 00:00, the same integer model the board uses,
 * so a session can be compared with a booking without touching a Date.
 */
export interface Induction {
  id: string
  title: string
  /** The sign-off a member walks away with. */
  grants: Ticket
  trainer: string
  location: string
  startMinute: number
  endMinute: number
  /** Seats in the room; enrolments beyond this are refused. */
  capacity: number
}

/** Local so this fixture stays free of any dependency on the time helpers. */
const at = (day: number, hour: number, minute = 0): number =>
  day * MINUTES_PER_DAY + hour * 60 + minute

/** Every session sits inside the workshop's opening hours for that day. */
export const INDUCTIONS: readonly Induction[] = [
  {
    id: 'ind-laser-mon',
    title: 'Laser cutting, first steps',
    grants: 'laser-basic',
    trainer: 'Ilra Diagana',
    location: 'Bay 1',
    startMinute: at(0, 18),
    endMinute: at(0, 20),
    capacity: 6,
  },
  {
    id: 'ind-cnc-basic-tue',
    title: 'CNC router basics',
    grants: 'cnc-basic',
    trainer: 'Tomas Berg',
    location: 'Bay 2',
    startMinute: at(1, 18),
    endMinute: at(1, 20, 30),
    capacity: 4,
  },
  {
    id: 'ind-metalwork-wed',
    title: 'Metalwork and hot processes',
    grants: 'metalwork',
    trainer: 'Nour Haddad',
    location: 'Yard',
    startMinute: at(2, 18),
    endMinute: at(2, 21),
    capacity: 4,
  },
  {
    id: 'ind-cnc-adv-thu',
    title: 'CNC router, advanced tooling',
    grants: 'cnc-advanced',
    trainer: 'Ilra Diagana',
    location: 'Bay 2',
    startMinute: at(3, 17, 30),
    endMinute: at(3, 20, 30),
    capacity: 3,
  },
  {
    id: 'ind-textiles-fri',
    title: 'Overlocker and textiles',
    grants: 'textiles',
    trainer: 'Pia Lindqvist',
    location: 'Studio',
    startMinute: at(4, 16),
    endMinute: at(4, 18),
    capacity: 6,
  },
  {
    id: 'ind-laser-sat',
    title: 'Laser cutting, weekend run',
    grants: 'laser-basic',
    trainer: 'Tomas Berg',
    location: 'Bay 1',
    startMinute: at(5, 10),
    endMinute: at(5, 12),
    capacity: 8,
  },
  {
    id: 'ind-textiles-sun',
    title: 'Overlocker, small group',
    grants: 'textiles',
    trainer: 'Pia Lindqvist',
    location: 'Studio',
    startMinute: at(6, 11),
    endMinute: at(6, 13),
    capacity: 2,
  },
]

export const INDUCTIONS_BY_ID: ReadonlyMap<string, Induction> = new Map(
  INDUCTIONS.map((induction) => [induction.id, induction]),
)
