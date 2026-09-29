// Types mirror the NextTrain API responses (camelCase JSON).

export interface Route {
  id: string
  name: string
  color: string
  textColor: string
  directionNames: string[]
  directionDestinations: string[]
}

export interface Station {
  mbtaStopId: string
  name: string
  latitude: number
  longitude: number
  routeId: string // comma-separated for transfer stations, e.g. "Orange,Red"
  averageWeekdayBoardings: number | null
}

export interface Prediction {
  routeId: string
  directionId: number
  arrivalTime: string | null
  departureTime: string | null
  status: string | null
}

export interface Vehicle {
  id: string
  routeId: string
  directionId: number
  latitude: number
  longitude: number
  bearing: number | null // degrees clockwise from north
  currentStatus: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO' | null
  stopName: string | null // the stop it's at or heading to
}

export interface RouteShape {
  routeId: string
  polyline: string // Google encoded polyline
}

export interface Commute {
  id: number
  mbtaStopId: string
  stationName: string
  routeId: string
  directionId: number
  windowStart: string // "07:45:00", Boston local time
  windowEnd: string
  activeDays: string // "Mon,Tue,Wed,Thu,Fri"
  isEnabled: boolean
}

export type CommuteInput = Pick<Commute, 'mbtaStopId' | 'routeId' | 'directionId' | 'windowStart' | 'windowEnd' | 'activeDays'>

/** An HTTP error with the API's own message (e.g. a validation error) when it sent one. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId(), ...init?.headers },
  })
  if (!response.ok) {
    // ASP.NET problem details: { title, errors: { Field: ["message"] } }
    const problem = await response.json().catch(() => undefined)
    const firstError = Object.values(problem?.errors ?? {}).flat()[0] as string | undefined
    throw new ApiError(response.status, firstError ?? problem?.title ?? response.statusText)
  }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>
}

// Anonymous per-device ID that owns this device's saved commutes.
// ponytail: whoever knows the ID can read its commutes; replace with real sign-in (e.g. Sign in with Apple) before launch.
let sessionUserId: string | undefined
function userId(): string {
  try {
    let id = localStorage.getItem('nexttrain.userId')
    if (!id) {
      id = randomId()
      localStorage.setItem('nexttrain.userId', id)
    }
    return id
  } catch {
    return (sessionUserId ??= randomId()) // storage blocked: commutes last for this visit only
  }
}

// randomUUID needs HTTPS; getRandomValues also works over plain HTTP (e.g. testing on a phone over Wi-Fi).
const randomId = () =>
  crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

// Fetches `path` once per page load and shares the result; a failure allows a retry.
function fetchOnce<T>(path: string): () => Promise<T> {
  let promise: Promise<T> | undefined
  return () =>
    (promise ??= api<T>(path).catch((e) => {
      promise = undefined
      throw e
    }))
}

// Routes and stations almost never change.
export const getRoutes = fetchOnce<Route[]>('/routes')
export const getStations = fetchOnce<Station[]>('/stations')

export const stationRouteIds = (station: Station) => station.routeId.split(',')

/** Case-insensitive name search, names starting with the query first. */
export function searchStations(stations: Station[], query: string, limit = 8): Station[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return stations
    .filter((s) => s.name.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, limit)
}
