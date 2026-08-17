/**
 * A forgiving `localStorage` wrapper. Storage can be unavailable (private
 * browsing, blocked cookies) or hold data written by an older build, and in
 * both cases the board should fall back rather than fail to start.
 */

const PREFIX = 'benchclock'

export const STORAGE_KEYS = {
  bookings: `${PREFIX}:bookings:v1`,
  member: `${PREFIX}:member:v1`,
  filters: `${PREFIX}:filters:v1`,
} as const

function getStore(): Storage | null {
  try {
    const store = window.localStorage
    const probe = `${PREFIX}:probe`
    store.setItem(probe, probe)
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const store = getStore()
  if (!store) return fallback

  try {
    const raw = store.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): boolean {
  const store = getStore()
  if (!store) return false

  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded, or a value with a circular reference.
    return false
  }
}

/**
 * Reads a persisted value and hands it to `parse`, which returns `null` for
 * anything it does not recognise. Keeps schema drift out of the components.
 */
export function readValidated<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): T {
  const raw = readJson<unknown>(key, null)
  if (raw === null) return fallback
  return parse(raw) ?? fallback
}
