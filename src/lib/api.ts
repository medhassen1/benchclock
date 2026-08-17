import { MACHINES_BY_ID, MEMBERS_BY_ID } from '@/data/workshop'
import { findRejections } from '@/lib/rules'
import type { Booking, BookingDraft, Rejection } from '@/types'

/**
 * The board is offline, but every write goes through this module so the UI is
 * written against an asynchronous, cancellable, failable source. Latency is
 * simulated and varies per call, which is exactly the condition that lets a
 * slow response land after a newer one.
 */

export class RequestAbortedError extends Error {
  constructor() {
    super('Request aborted')
    this.name = 'RequestAbortedError'
  }
}

/** A write the server refused; carries the same rejections the UI shows. */
export class BookingRejectedError extends Error {
  readonly rejections: readonly Rejection[]

  constructor(rejections: readonly Rejection[]) {
    super(rejections[0]?.message ?? 'Booking rejected')
    this.name = 'BookingRejectedError'
    this.rejections = rejections
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

export type LatencyResolver = (label: string) => number

function hash(value: string): number {
  let total = 0
  for (let i = 0; i < value.length; i += 1) total = (total * 31 + value.charCodeAt(i)) % 100_000
  return total
}

/** Deterministic but uneven, so concurrent calls can resolve out of order. */
const defaultLatency: LatencyResolver = (label) => 60 + (hash(label) % 180)

let latencyResolver: LatencyResolver = defaultLatency

/** Test seam: replaces the latency model, or restores the default when omitted. */
export function configureLatency(resolver?: LatencyResolver | number): void {
  if (resolver === undefined) latencyResolver = defaultLatency
  else if (typeof resolver === 'number') latencyResolver = () => resolver
  else latencyResolver = resolver
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestAbortedError())
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timer)
      reject(new RequestAbortedError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface RequestOptions {
  signal?: AbortSignal
}

let nextId = 0

/** Resets the id counter so tests get stable ids. */
export function resetIdCounter(): void {
  nextId = 0
}

/**
 * Validates a draft against the board as the server sees it and returns the
 * stored booking. Rejects with `BookingRejectedError` when a rule fails, so
 * the UI cannot write a booking that its own checks would have blocked.
 */
export async function createBooking(
  draft: BookingDraft,
  board: readonly Booking[],
  options: RequestOptions = {},
): Promise<Booking> {
  await wait(latencyResolver(`create:${draft.machineId}`), options.signal)

  const machine = MACHINES_BY_ID.get(draft.machineId)
  const member = MEMBERS_BY_ID.get(draft.memberId)
  if (!machine) throw new NotFoundError(`Machine ${draft.machineId}`)
  if (!member) throw new NotFoundError(`Member ${draft.memberId}`)

  const rejections = findRejections(draft, { machine, member, existing: board })
  if (rejections.length > 0) throw new BookingRejectedError(rejections)

  nextId += 1
  return { ...draft, id: `bk-${String(nextId).padStart(4, '0')}`, createdAt: nextId }
}

/**
 * Re-times an existing booking. The booking under edit is excluded from the
 * clash and allowance checks, so moving it by one slot does not read as a
 * collision with its own old position.
 */
export async function updateBooking(
  bookingId: string,
  draft: BookingDraft,
  board: readonly Booking[],
  options: RequestOptions = {},
): Promise<Booking> {
  await wait(latencyResolver(`update:${bookingId}`), options.signal)

  const existing = board.find((booking) => booking.id === bookingId)
  if (!existing) throw new NotFoundError(`Booking ${bookingId}`)

  const machine = MACHINES_BY_ID.get(draft.machineId)
  const member = MEMBERS_BY_ID.get(draft.memberId)
  if (!machine) throw new NotFoundError(`Machine ${draft.machineId}`)
  if (!member) throw new NotFoundError(`Member ${draft.memberId}`)

  const rejections = findRejections(draft, {
    machine,
    member,
    existing: board,
    ignoreBookingId: bookingId,
  })
  if (rejections.length > 0) throw new BookingRejectedError(rejections)

  return { ...existing, ...draft }
}

export async function cancelBooking(
  bookingId: string,
  board: readonly Booking[],
  options: RequestOptions = {},
): Promise<string> {
  await wait(latencyResolver(`cancel:${bookingId}`), options.signal)

  if (!board.some((booking) => booking.id === bookingId)) {
    throw new NotFoundError(`Booking ${bookingId}`)
  }
  return bookingId
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof RequestAbortedError ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
