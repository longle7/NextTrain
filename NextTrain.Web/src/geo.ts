import type { Station } from './api'
import { readKey, writeKey } from './cache'

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

/** The angle between two compass headings, 0 (same way) to 180 (opposite), for any degrees, negative too. */
export const angleBetween = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180)

/** The `count` closest stations to `here`, nearest first, with their distance. */
export function nearestStations(stations: Station[], here: Point, count = 3) {
  return stations
    .map((station) => ({ station, miles: distanceMiles(here, station) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count)
}

const LOCATION_KEY = 'nexttrain.location'

/** Whether the rider has used their location here before: then Home and the Map find them without a tap. */
export const locationRemembered = () => readKey(LOCATION_KEY) === 'on'

/** Remembers that location works, or forgets it (permission refused, Delete my data) so the button comes back. */
export const rememberLocation = (on: boolean) => writeKey(LOCATION_KEY, on ? 'on' : null)

/** Where the phone is, once, remembering whether location works. Rejects with a GeolocationPositionError. */
export const currentPosition = () =>
  new Promise<GeolocationCoordinates>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (position) => {
        rememberLocation(true)
        resolve(position.coords)
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) rememberLocation(false)
        reject(error)
      },
      { maximumAge: 60_000, timeout: 15_000 },
    ),
  )

/** What to tell someone when the phone can't give us their location. */
export const locationErrorMessage = (error: GeolocationPositionError) =>
  error.code === error.PERMISSION_DENIED
    ? 'Location access is off for NextTrain. You can allow it in Settings.'
    : "Couldn't find your location. Try again in a moment."

/** Farther than this from every station, you're outside the T's area (App Review, for one, tests from California). */
export const OUT_OF_AREA_MILES = 25

/**
 * The box around [lat, lon] points, widened by `margin` (a fraction of its size) on every side so nothing sits on
 * the map's edge. Undefined for no points.
 */
export function boundsOf(points: [number, number][], margin = 0.08) {
  if (!points.length) return undefined
  const lats = points.map(([lat]) => lat)
  const lons = points.map(([, lon]) => lon)
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)]
  const padLat = (north - south) * margin
  const padLon = (east - west) * margin
  return { north: north + padLat, south: south - padLat, east: east + padLon, west: west - padLon }
}

/** "0.4 mi · 10 min walk", or just "3.2 mi away" past a reasonable walk. */
export function walkLabel(miles: number): string {
  const distance = `${miles < 0.1 ? '<0.1' : miles.toFixed(1)} mi`
  if (miles > 1.5) return `${distance} away`
  return `${distance} · ${walkMinutes(miles)} min walk`
}

/** Minutes to walk a straight-line distance. */
// ponytail: streets run ~1.25x the straight line, walking ~3 mph; use a routing API if this misleads.
export const walkMinutes = (miles: number) => Math.max(1, Math.round(miles * 1.25 * 20))

// A trip starts (or ends) at a station or stop within this of the place: about a 12-minute walk.
export const TRIP_STOP_MILES = 0.5

/**
 * Where a trip from (or to) a place can start (or end): up to 8 subway stations and bus stops within TRIP_STOP_MILES,
 * nearest first. The closest 3 stations always count, even when bus stops are closer: downtown, 8 bus stops can sit
 * nearer than the T.
 */
export function tripStops(stations: Station[], busStops: Station[], here: Point) {
  const near = (list: Station[], count: number) => nearestStations(list, here, count).filter((n) => n.miles <= TRIP_STOP_MILES)
  const subway = near(stations, 3)
  return [...subway, ...near(busStops, 8 - subway.length)]
}

/** The stops as GET /trips takes them: "1308:4,place-cool:7", each with its minutes' walk. */
export const tripStopsParam = (stops: { station: Station; miles: number }[]) =>
  stops.map(({ station, miles }) => `${station.mbtaStopId}:${walkMinutes(miles)}`).join(',')
