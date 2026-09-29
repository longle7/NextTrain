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

/** What to tell someone when the phone can't give us their location. */
export const locationErrorMessage = (error: GeolocationPositionError) =>
  error.code === error.PERMISSION_DENIED
    ? 'Location access is off for NextTrain. You can allow it in Settings.'
    : "Couldn't find your location. Try again in a moment."

/** Farther than this from every station, you're outside the T's area (App Review, for one, tests from California). */
export const OUT_OF_AREA_MILES = 25

/** "0.4 mi · 10 min walk", or just "3.2 mi away" past a reasonable walk. */
export function walkLabel(miles: number): string {
  const distance = `${miles < 0.1 ? '<0.1' : miles.toFixed(1)} mi`
  if (miles > 1.5) return `${distance} away`
  // ponytail: streets run ~1.25x the straight line, walking ~3 mph; use a routing API if this misleads.
  const minutes = Math.max(1, Math.round(miles * 1.25 * 20))
  return `${distance} · ${minutes} min walk`
}
