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

// Routes almost never change, so fetch them once per page load.
let routesPromise: Promise<Route[]> | undefined
export function getRoutes(): Promise<Route[]> {
  routesPromise ??= api<Route[]>('/routes').catch((e) => {
    routesPromise = undefined // allow retry after a failure
    throw e
  })
  return routesPromise
}

export const stationRouteIds = (station: Station) => station.routeId.split(',')
