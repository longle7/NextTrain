import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { Station } from './api'
import { readKey, writeKey } from './cache'

export interface Point {
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

/**
 * Where the phone is, once, remembering whether location works. Rejects with a GeolocationPositionError (its code
 * says whether location is off). In the iPhone app it asks iOS through Capacitor's plugin, under the app's own
 * permission: the web view's own geolocation asks again ("localhost would like to use your location") every launch.
 */
export const currentPosition = (): Promise<Point> =>
  (Capacitor.isNativePlatform() ? nativePosition() : webPosition()).then(
    (coords) => {
      rememberLocation(true)
      return coords
    },
    (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) rememberLocation(false)
      throw error
    },
  )

const OPTIONS = { maximumAge: 60_000, timeout: 15_000 }

const webPosition = () =>
  new Promise<Point>((resolve, reject) => navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, OPTIONS))

// The plugin's failures as the web's errors: location turned off for NextTrain, or no fix (off, indoors, too slow).
const nativePosition = () =>
  Geolocation.getCurrentPosition(OPTIONS).then(
    (p): Point => ({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
    async () => {
      const denied = (await Geolocation.checkPermissions().catch(() => undefined))?.location === 'denied'
      throw { code: denied ? 1 : 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' } as GeolocationPositionError
    },
  )

/**
 * Whether location is already allowed, so Home, the Map, and the trip planner find you without a tap or a prompt:
 * iOS's answer in the iPhone app; on the website, location having worked here before or the browser saying so.
 */
export async function locationAllowed(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return (await Geolocation.checkPermissions().catch(() => undefined))?.location === 'granted'
  if (locationRemembered()) return true
  return (await navigator.permissions?.query({ name: 'geolocation' }).catch(() => undefined))?.state === 'granted'
}

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
