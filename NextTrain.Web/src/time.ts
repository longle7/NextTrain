import type { Prediction } from './api'

/**
 * MBTA-style countdown label for a departure: "Boarding", "Approaching", or "N min".
 * Returns undefined for trains that already left.
 */
export function countdown(departureIso: string, now: Date): string | undefined {
  const seconds = (new Date(departureIso).getTime() - now.getTime()) / 1000
  if (seconds < -15) return undefined
  if (seconds <= 30) return 'Boarding'
  if (seconds <= 60) return 'Approaching'
  return `${Math.round(seconds / 60)} min`
}

/**
 * Upcoming boardable departures grouped by route and direction, soonest first.
 * Arrival-only predictions (trains ending at this station) are dropped.
 */
export function groupDepartures(predictions: Prediction[], now: Date, perGroup = 3) {
  const groups = new Map<string, { routeId: string; directionId: number; departures: string[] }>()

  for (const p of predictions) {
    if (!p.departureTime || countdown(p.departureTime, now) === undefined) continue
    const key = `${p.routeId}|${p.directionId}`
    const group = groups.get(key) ?? { routeId: p.routeId, directionId: p.directionId, departures: [] }
    group.departures.push(p.departureTime)
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((g) => ({ ...g, departures: g.departures.sort((x, y) => Date.parse(x) - Date.parse(y)).slice(0, perGroup) }))
    .sort((a, b) => a.routeId.localeCompare(b.routeId) || a.directionId - b.directionId)
}

/** "Updated 5s ago" helper. */
export function secondsAgo(date: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000))
}

/** "7:45 AM" in the device's locale. */
export const clock = (time: Date | string) => new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
