import { busRouteIds, stationRouteIds, type Station } from './api'
import { distanceMiles, walkMinutes } from './geo'

/** The farthest a change may be on foot, in minutes at the app's walking speed (the API allows up to 400 m). */
export const CHANGE_WALK_MINUTES = 5

/** A place to catch another route: get off the ride at `off`, walk `walk` minutes (0: the same stop) to `on`. */
export interface CatchPoint {
  off: Station
  on: Station
  walk: number
}

/**
 * Every other route a rider can change to along their ride, and where: at a later stop of the ride itself, or at a
 * station or stop within a 5-minute walk of one. Off the 66 at Tremont St @ Columbus Ave, it's a minute's walk to the
 * 22 at Columbus Ave @ Malcolm X Blvd, a stop the 66 doesn't serve. Each route's places come in riding order, each
 * place once, with its shortest walk.
 * @param later the ride's stops after where the rider boards, in riding order
 * @param stops every station and bus stop
 * @param ownRoute the ride's own route, which isn't a change
 */
export function changeOptions(later: Station[], stops: Station[], ownRoute: string): Map<string, CatchPoint[]> {
  const byRoute = new Map<string, Map<string, CatchPoint>>()
  for (const off of later) {
    for (const on of stops) {
      if (Math.abs(on.latitude - off.latitude) > 0.004) continue // quick no: 0.004 degrees is ~450 m north-south
      const walk = on.mbtaStopId === off.mbtaStopId ? 0 : walkMinutes(distanceMiles(off, on))
      if (walk > CHANGE_WALK_MINUTES) continue
      for (const route of [...stationRouteIds(on), ...busRouteIds(on)]) {
        if (route === ownRoute) continue
        const places = byRoute.get(route) ?? new Map<string, CatchPoint>()
        const known = places.get(on.mbtaStopId)
        if (!known || walk < known.walk) places.set(on.mbtaStopId, { off, on, walk })
        byRoute.set(route, places)
      }
    }
  }
  return new Map([...byRoute].map(([route, places]) => [route, [...places.values()]]))
}
