/**
 * Puts trains exactly on their line, pointing the way they're going.
 *
 * A train's GPS position can sit a few meters off the drawn track, and MBTA's compass bearing can be stale (a train
 * that just reversed at the end of the line still reports its old heading). So each train is moved to the nearest
 * point on its own route's track, and its arrow follows the track there, pointing, in order of reliability:
 *   1. toward its destination (a train "to Alewife" always moves toward Alewife),
 *   2. toward its next stop,
 *   3. along the track the way MBTA's compass bearing says.
 */

export interface Track {
  routeId: string
  points: [number, number][] // [lat, lon], in order along the line
}

interface Train {
  routeId: string
  latitude: number
  longitude: number
  bearing: number | null // degrees clockwise from north
  currentStatus: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO' | null
  stationId: string | null // the station it's at or heading to
  destination: string | null // e.g. "Alewife", "Ashmont/Braintree" (either branch), "Medford/Tufts"
}

interface StationLike {
  mbtaStopId: string
  name: string
  latitude: number
  longitude: number
}

export interface Placed {
  latitude: number
  longitude: number
  heading: number | null // arrow direction, degrees clockwise from north; null if unknown
}

/** Farther than this from its line (e.g. in a yard), a train stays where its GPS puts it. */
export const MAX_SNAP_METERS = 150
/** A stop at least this far along the track (either way) sets the direction; closer, it's too close to call. */
const MIN_STOP_AHEAD_METERS = 30

// Meters east/north of a reference latitude. Flat-earth math is plenty accurate across one subway system.
const M_PER_DEG_LAT = 111_320
const toXY = (lat: number, lon: number, cosLat: number): [number, number] => [lon * M_PER_DEG_LAT * cosLat, lat * M_PER_DEG_LAT]

interface Segment {
  track: Track
  index: number // points[index] -> points[index + 1]
  start: number // meters along the track where it begins
  length: number
  from: [number, number] // xy
  dx: number
  dy: number
}

interface Hit {
  segment: Segment
  t: number // 0..1 along the segment
  distance: number // meters from the point to the track
  along: number // meters along the track
}

/** Precomputes every track's segments, then places trains on them. Build once per set of tracks. */
export function trackSnapper(tracks: Track[], stations: StationLike[]) {
  const stationById = new Map(stations.map((s) => [s.mbtaStopId, s]))
  const stationByName = new Map(stations.map((s) => [s.name, s]))
  const lats = tracks.flatMap((t) => t.points.map(([lat]) => lat))
  const cosLat = Math.cos(((lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 42.36) * Math.PI) / 180)

  const byRoute = new Map<string, Segment[]>()
  for (const track of tracks) {
    const segments = byRoute.get(track.routeId) ?? []
    let start = 0
    for (let i = 0; i + 1 < track.points.length; i++) {
      const from = toXY(...track.points[i], cosLat)
      const to = toXY(...track.points[i + 1], cosLat)
      const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
      const length = Math.hypot(dx, dy)
      if (length > 0) segments.push({ track, index: i, start, length, from, dx, dy })
      start += length
    }
    byRoute.set(track.routeId, segments)
  }

  // The closest point to (x, y) on the given segments; only on `track` if one is given.
  const nearest = (segments: Segment[], x: number, y: number, track?: Track): Hit | undefined => {
    let best: Hit | undefined
    for (const segment of segments) {
      if (track && segment.track !== track) continue
      const { from, dx, dy, length } = segment
      const t = Math.max(0, Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / (length * length)))
      const distance = Math.hypot(from[0] + t * dx - x, from[1] + t * dy - y)
      if (!best || distance < best.distance) best = { segment, t, distance, along: segment.start + t * length }
    }
    return best
  }

  return function place(train: Train): Placed {
    const gps = { latitude: train.latitude, longitude: train.longitude, heading: train.bearing }
    const hit = nearest(byRoute.get(train.routeId) ?? [], ...toXY(train.latitude, train.longitude, cosLat))
    if (!hit || hit.distance > MAX_SNAP_METERS) return gps

    const { segment, t } = hit
    const [a, b] = [segment.track.points[segment.index], segment.track.points[segment.index + 1]]
    const forward = (Math.atan2(segment.dx, segment.dy) * 180) / Math.PI // the track's heading as its points go
    const heading = (direction: number | null) => (direction === null ? null : (((forward + direction) % 360) + 360) % 360)

    return {
      latitude: a[0] + t * (b[0] - a[0]),
      longitude: a[1] + t * (b[1] - a[1]),
      heading: heading(
        destinations(train.destination).reduce<number | null>((found, s) => found ?? toward(s, train, hit), null) ??
          // The next stop, unless the train is stopped at it: then that stop is here, not ahead.
          (train.currentStatus === 'STOPPED_AT' ? null : toward(stationById.get(train.stationId ?? ''), train, hit)) ??
          alignedWithBearing(train.bearing, forward),
      ),
    }
  }

  // "Ashmont/Braintree" is either branch's end; "Medford/Tufts" is one station's name.
  function destinations(name: string | null): StationLike[] {
    if (!name) return []
    const exact = stationByName.get(name)
    return exact ? [exact] : name.split('/').flatMap((part) => stationByName.get(part.trim()) ?? [])
  }

  // 0 to follow the track's point order, 180 to go against it: whichever way `station` is along the train's own
  // track. Null if the station isn't on that track (another branch) or is too close to call.
  function toward(station: StationLike | undefined, train: Train, hit: Hit): number | null {
    if (!station) return null
    const stop = nearest(byRoute.get(train.routeId)!, ...toXY(station.latitude, station.longitude, cosLat), hit.segment.track)
    if (!stop || stop.distance > MAX_SNAP_METERS || Math.abs(stop.along - hit.along) < MIN_STOP_AHEAD_METERS) return null
    return stop.along > hit.along ? 0 : 180
  }
}

// 0 or 180: whichever way along the track is closer to MBTA's compass bearing.
function alignedWithBearing(bearing: number | null, forward: number): number | null {
  if (bearing === null) return null
  const difference = Math.abs(((bearing - forward) % 360 + 540) % 360 - 180) // 0..180
  return difference <= 90 ? 0 : 180
}
