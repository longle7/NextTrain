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

/** The worst alert that changes service, if any. */
export const majorAlert = (alerts: Alert[]) => alerts.find((a) => a.severity >= MAJOR_SEVERITY)

/** Short status label: "Suspension", "Delays", "Station closed", ... */
export const effectLabel = (effect: string) => EFFECTS[effect] ?? 'Service alert'

const effectRank = (alert: Alert) => {
  const i = EFFECT_ORDER.indexOf(alert.effect)
  return i === -1 ? EFFECT_ORDER.length : i
}
