import type { Route, Station, Vehicle } from './api'

export interface LineTrain {
  id: string
  down: boolean // moving toward the last station in the list
  atStation: boolean // stopped at it, rather than approaching it
  label: string // for screen readers, e.g. "Train to Alewife, approaching Harvard"
}

/**
 * For each direction ID, whether its trains move down the line-order list, found by comparing where the two
 * destinations sit in it. A destination is a station name ("Alewife", "Medford/Tufts") or a branch pair
 * ("Ashmont/Braintree").
 */
export function directionsDown(stations: Station[], destinations: string[]): boolean[] {
  const position = (destination: string) =>
    stations.findIndex((s) => s.name === destination || destination.split('/').includes(s.name))
  const [zero, one] = destinations.map(position)
  const zeroDown =
    zero >= 0 && one >= 0 ? zero > one
    : zero >= 0 ? zero >= stations.length / 2 // only one end found: which half it's in
    : one >= 0 ? one < stations.length / 2
    : false
  return [zeroDown, !zeroDown]
}

/**
 * The route's live trains by the station they're stopped at or approaching. With `oneDirection` (a bus route, whose
 * stops are listed one way at a time), only that direction's vehicles, all moving down the list.
 */
export function trainsByStation(vehicles: Vehicle[], route: Route, stations: Station[], oneDirection?: number): Map<string, LineTrain[]> {
  const down = oneDirection === undefined ? directionsDown(stations, route.directionDestinations) : [true, true]
  const noun = route.type === 'bus' ? 'Bus' : 'Train'
  const byStation = new Map<string, LineTrain[]>()
  for (const v of vehicles) {
    if (v.routeId !== route.id || !v.stationId) continue
    if (oneDirection !== undefined && v.directionId !== oneDirection) continue
    const atStation = v.currentStatus === 'STOPPED_AT'
    const where = `${atStation ? 'stopped at' : 'approaching'} ${v.stopName ?? `the next ${route.type === 'bus' ? 'stop' : 'station'}`}`
    const train = { id: v.id, down: down[v.directionId] ?? false, atStation, label: `${noun} to ${route.directionDestinations[v.directionId]}, ${where}` }
    byStation.set(v.stationId, [...(byStation.get(v.stationId) ?? []), train])
  }
  return byStation
}
