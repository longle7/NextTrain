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
 * Upcoming departures grouped by route and direction, soonest first. Trains that already left are dropped. A group is
 * `scheduled` when its times come from the timetable (the API never mixes them with live ones for a route one way).
 */
export function groupDepartures(predictions: Prediction[], now: Date, perGroup = 3) {
  const groups = new Map<string, { routeId: string; directionId: number; scheduled: boolean; departures: string[] }>()

  for (const p of predictions) {
    if (countdown(p.departureTime, now) === undefined) continue
    const key = `${p.routeId}|${p.directionId}`
    const group = groups.get(key) ?? { routeId: p.routeId, directionId: p.directionId, scheduled: !!p.scheduled, departures: [] }
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

/** Live times refresh every 10 seconds; older than this, something is wrong (offline, MBTA down). */
export const STALE_AFTER_SECONDS = 30

/** "45s ago" or "3 min ago". */
export const agoLabel = (seconds: number) => (seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)} min ago`)

/** "7:45 AM" in the device's locale. */
export const clock = (time: Date | string) => new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** A departure as shown: a live countdown ("5 min"), or a timetable time as the clock time ("5:32 AM"). */
export const departureLabel = (time: string, scheduled: boolean, now: Date) => (scheduled ? clock(time) : countdown(time, now))

/** Why a station shows no departures: a service alert, the overnight closure (about 1 to 5 AM), or nothing predicted yet. */
export function noTrainsMessage(hasMajorAlert: boolean, now: Date): string {
  if (hasMajorAlert) return 'No trains are predicted here right now. See the service alert above.'
  const hour = now.getHours()
  if (hour >= 1 && hour < 5) return 'The subway is closed overnight. Trains start again around 5 AM.'
  return 'No trains are predicted here right now. Check back in a minute.'
}
