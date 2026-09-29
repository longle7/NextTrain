// Recently viewed stations, kept on this device only (see the privacy policy) to list them on Home.
const KEY = 'nexttrain.recentStations'
export const MAX_RECENT = 3

/** `id` moved to the front, without duplicates, capped at MAX_RECENT. */
export const withRecent = (ids: string[], id: string) => [id, ...ids.filter((x) => x !== id)].slice(0, MAX_RECENT)

// Blocked or corrupted storage just means no recents.
export function recentStationIds(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function rememberStation(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(withRecent(recentStationIds(), id)))
  } catch {
    // storage blocked: nothing to remember with
  }
}

export function forgetRecentStations() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // storage blocked: nothing stored
  }
}
