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

export async function api<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

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
