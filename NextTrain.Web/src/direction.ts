import { distanceMiles } from './geo'
import type { Route } from './api'

// Inbound and outbound on the map: toward downtown Boston, or away from it.
// Buses and the Mattapan trolley say so themselves (MBTA names their directions "Inbound" and "Outbound"). Subway lines
// run through downtown instead ("South"/"North", "West"/"East"): a southbound Red Line train is inbound at Alewife and
// outbound at JFK. So a train is inbound when it's heading toward downtown.

export type Direction = 'inbound' | 'outbound'

// Between Park Street, Downtown Crossing, State, and Government Center.
const DOWNTOWN = { latitude: 42.3571, longitude: -71.0598 }

// Trains this close to downtown (about 600 m) are passing through it, neither inbound nor outbound: shown either way.
const DOWNTOWN_MILES = 0.37

/**
 * Whether a vehicle is inbound or outbound, or undefined when it can't be told (downtown, or no heading yet).
 * `heading` is degrees clockwise from north: the way it's going along its track.
 */
export function directionOf(route: Route | undefined, directionId: number, latitude: number, longitude: number, heading: number | null): Direction | undefined {
  const named = route?.directionNames[directionId]
  if (named === 'Inbound' || named === 'Outbound') return named === 'Inbound' ? 'inbound' : 'outbound'
  if (heading === null || distanceMiles({ latitude, longitude }, DOWNTOWN) < DOWNTOWN_MILES) return undefined
  const toDowntown = bearing(latitude, longitude, DOWNTOWN.latitude, DOWNTOWN.longitude)
  const off = Math.abs(((heading - toDowntown + 540) % 360) - 180) // 0 = straight at downtown, 180 = straight away
  return off < 90 ? 'inbound' : 'outbound'
}

/** Whether a vehicle belongs on the map with this filter (undefined: all of them). */
export const showsDirection = (filter: Direction | undefined, direction: Direction | undefined) =>
  !filter || !direction || filter === direction

// Compass bearing from one point to another, degrees clockwise from north.
function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad)
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad)
  return (Math.atan2(y, x) / rad + 360) % 360
}
