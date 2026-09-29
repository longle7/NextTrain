import type { Station } from './api'

interface Point {
  latitude: number
  longitude: number
}

/** Straight-line (haversine) distance in miles. */
export function distanceMiles(a: Point, b: Point): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * 3958.8 * Math.asin(Math.sqrt(h))
}

/** The `count` closest stations to `here`, nearest first, with their distance. */
export function nearestStations(stations: Station[], here: Point, count = 3) {
  return stations
    .map((station) => ({ station, miles: distanceMiles(here, station) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count)
}

/** "0.4 mi · 10 min walk". */
export function walkLabel(miles: number): string {
  // ponytail: streets run ~1.25x the straight line, walking ~3 mph; use a routing API if this misleads.
  const minutes = Math.max(1, Math.round(miles * 1.25 * 20))
  return `${miles < 0.1 ? '<0.1' : miles.toFixed(1)} mi · ${minutes} min walk`
}
