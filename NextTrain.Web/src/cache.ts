// The last good answer for each poll (train times, stations, alerts, your commutes), kept on this device only, so
// NextTrain has something to show when it opens in a tunnel. Pages show its age ("Last updated 8:02 AM").
const PREFIX = 'nexttrain.cache.'
const MAX_ENTRIES = 40 // stations visited pile up; the oldest go first

interface Entry<T> {
  data: T
  at: number // when it was fetched (ms since epoch)
}

/** localStorage that never throws: blocked storage reads as nothing stored, and a write that can't happen is skipped. */
export function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Stores a value, or removes the key for null. */
export function writeKey(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage blocked or full: it still applies for this visit
  }
}

/** Which keys to drop so only the `max` newest remain. */
export const keysToEvict = (entries: [key: string, at: number][], max = MAX_ENTRIES) =>
  [...entries].sort((a, b) => a[1] - b[1]).slice(0, Math.max(0, entries.length - max)).map(([key]) => key)

export function remembered<T>(key: string): { data: T; updatedAt: Date } | undefined {
  try {
    const entry = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null') as Entry<T> | null
    return entry ? { data: entry.data, updatedAt: new Date(entry.at) } : undefined
  } catch {
    return undefined // blocked or corrupted storage: nothing remembered
  }
}

export function remember(key: string, data: unknown) {
  if (data === undefined) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, at: Date.now() }))
    const entries = cacheKeys().map((k): [string, number] => [k, (JSON.parse(localStorage.getItem(k) ?? '{}') as Entry<unknown>).at ?? 0])
    for (const k of keysToEvict(entries)) localStorage.removeItem(k)
  } catch {
    // storage full or blocked: the app still works, just without last-known data offline
  }
}

/** Drop one remembered answer, e.g. your commutes after you change them, so Home doesn't open on the old list. */
export const forget = (key: string) => writeKey(PREFIX + key, null)

/** Delete my data. */
export function forgetRemembered() {
  try {
    for (const k of cacheKeys()) localStorage.removeItem(k)
  } catch {
    // storage blocked: nothing stored
  }
}

const cacheKeys = () => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
