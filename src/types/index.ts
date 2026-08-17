/** Machine categories a workshop groups its equipment into. */
export type MachineKind = 'laser' | 'cnc' | 'lathe' | 'printer3d' | 'welder' | 'sewing'

/** A sign-off a member must hold before booking a machine unsupervised. */
export type Ticket = 'laser-basic' | 'cnc-basic' | 'cnc-advanced' | 'metalwork' | 'textiles'

export type MembershipTier = 'casual' | 'regular' | 'keyholder'

export interface Machine {
  id: string
  name: string
  kind: MachineKind
  /** Short code shown in dense grid cells. */
  code: string
  /** Sign-off required to book it; null means anyone may book. */
  requiredTicket: Ticket | null
  /** Longest single booking allowed, in minutes. */
  maxSessionMinutes: number
  /** Minutes of cool-down needed after a booking before the next may start. */
  cooldownMinutes: number
  location: string
  outOfService: boolean
}

export interface Member {
  id: string
  name: string
  tier: MembershipTier
  tickets: readonly Ticket[]
  /** Bookable minutes per week for this member's tier. */
  weeklyMinuteAllowance: number
}

/**
 * A reservation. Times are minutes from the start of the week (Monday 00:00),
 * which keeps every calculation integer-only and free of timezone drift.
 */
export interface Booking {
  id: string
  machineId: string
  memberId: string
  startMinute: number
  endMinute: number
  note: string
  createdAt: number
}

/** A booking that has not been assigned an id yet. */
export type BookingDraft = Omit<Booking, 'id' | 'createdAt'>

export type RejectionCode =
  | 'out-of-service'
  | 'missing-ticket'
  | 'outside-opening-hours'
  | 'too-long'
  | 'zero-length'
  | 'overlaps-booking'
  | 'ignores-cooldown'
  | 'allowance-exceeded'

export interface Rejection {
  code: RejectionCode
  message: string
  /** Ids of existing bookings that caused the rejection, when relevant. */
  conflictIds?: readonly string[]
}

export interface DayWindow {
  /** 0 = Monday … 6 = Sunday. */
  day: number
  openMinute: number
  closeMinute: number
}
