import type { Alert } from './api'

/** Severity 3 and up changes how you travel; MBTA uses 1-2 for things like a closed staircase. */
export const MAJOR_SEVERITY = 3

// Worst first when severities tie.
const EFFECTS: Record<string, string> = {
  SUSPENSION: 'Suspension',
  SHUTTLE: 'Shuttle buses',
  STATION_CLOSURE: 'Station closed',
  STOP_CLOSURE: 'Stop closed',
  DELAY: 'Delays',
  DETOUR: 'Detour',
  SERVICE_CHANGE: 'Service change',
  TRACK_CHANGE: 'Track change',
  STATION_ISSUE: 'Station issue',
}
const EFFECT_ORDER = Object.keys(EFFECTS)

interface Scope {
  routeIds: string[]
  stopId?: string // limit to alerts covering the whole route or this station
  directionId?: number // limit to alerts covering both directions or this one
}

/** Alerts touching any of `routeIds`, optionally narrowed to a station and direction, worst first. */
export function alertsFor(alerts: Alert[], { routeIds, stopId, directionId }: Scope): Alert[] {
  return alerts
    .filter((alert) =>
      alert.entities.some(
        (e) =>
          (e.routeId === null || routeIds.includes(e.routeId)) &&
          (stopId === undefined || e.stopId === null || e.stopId === stopId) &&
          (directionId === undefined || e.directionId === null || e.directionId === directionId),
      ),
    )
    .sort((a, b) => b.severity - a.severity || effectRank(a) - effectRank(b))
}

// "Mon", "Tue", ... in Boston time, like a commute's days.
const bostonWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' })

// The days of the week a planned change covers (all seven when it's a week or more, or open-ended).
function weekdaysOf(alert: Alert): string[] {
  const days = new Set<string>()
  const last = alert.end ? Date.parse(alert.end) - 4 * 3_600_000 : Infinity // ending at 3 AM: the day before
  for (let time = Date.parse(alert.start!); days.size < 7 && time <= last; time += 86_400_000) days.add(bostonWeekday.format(time))
  return [...days]
}

/**
 * The soonest planned change (from /alerts/upcoming) that hits a commute: its route, station, and direction, on one of
 * its days ("Mon,Tue,..."), starting within a week.
 */
export function plannedFor(upcoming: Alert[], scope: Scope, activeDays: string, now: Date): Alert | undefined {
  const days = activeDays.split(',')
  const weekAway = now.getTime() + 7 * 86_400_000
  return alertsFor(upcoming, scope)
    .filter((a) => a.start && Date.parse(a.start) <= weekAway && weekdaysOf(a).some((d) => days.includes(d)))
    .sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!))[0]
}

/** The worst alert that changes service, if any. */
export const majorAlert = (alerts: Alert[]) => alerts.find((a) => a.severity >= MAJOR_SEVERITY)

/** Short status label: "Suspension", "Delays", "Station closed", ... */
export const effectLabel = (effect: string) => EFFECTS[effect] ?? 'Service alert'

const effectRank = (alert: Alert) => {
  const i = EFFECT_ORDER.indexOf(alert.effect)
  return i === -1 ? EFFECT_ORDER.length : i
}
