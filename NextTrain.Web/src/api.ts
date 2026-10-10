// Types mirror the NextTrain API responses (camelCase JSON).

export interface Route {
  id: string // MBTA's: "Red", "Green-B", "1", or "741" for SL1
  name: string // "Red Line"; a bus route's ends, "Harvard Square - Nubian Station"
  color: string
  textColor: string
  directionNames: string[]
  directionDestinations: string[]
  type: 'subway' | 'bus'
  shortName: string // what riders call a bus route: "1", "SL1"; "" or a branch letter for the subway
}

/** A subway station or a bus stop. */
export interface Station {
  mbtaStopId: string
  name: string
  latitude: number
  longitude: number
  routeId: string // subway lines, comma-separated for transfer stations ("Orange,Red"); "" at a bus-only stop
  busRoutes?: string | null // bus routes and the directions they stop here in: "1:0,741:1"
  averageWeekdayBoardings: number | null
  isAccessible: boolean | null // step-free wheelchair access; null when MBTA has no information
}

export interface Prediction {
  routeId: string
  directionId: number
  departureTime: string // the API only sends trains you can board
  // A timetable time, sent (with ?schedules=true) only for a route one way that has no live prediction.
  scheduled?: boolean
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
  stationId: string | null // that stop's station, e.g. "place-harsq"
  cars: Car[] // front to back
}

// How full a car is, when MBTA reports it (today: Orange, and the newer Red Line cars); otherwise both null.
export interface Car {
  crowding: 'MANY_SEATS_AVAILABLE' | 'FEW_SEATS_AVAILABLE' | 'STANDING_ROOM_ONLY' | 'CRUSHED_STANDING_ROOM_ONLY' | 'FULL' | null
  percentFull: number | null
}

export interface RouteShape {
  routeId: string
  polyline: string // Google encoded polyline
}

export interface Alert {
  id: string
  effect: string // "SUSPENSION", "DELAY", "STATION_CLOSURE", ...
  severity: number // 0 (information) to 10 (worst)
  summary: string // short, e.g. "Symphony closed"
  header: string // a sentence or two
  description: string | null
  timeframe: string | null // "through Sunday", "ongoing"
  url: string | null
  entities: AlertEntity[]
}

// null means "all": every route, the whole route, or both directions.
export interface AlertEntity {
  routeId: string | null
  stopId: string | null
  directionId: number | null
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
}

export type CommuteInput = Pick<Commute, 'mbtaStopId' | 'routeId' | 'directionId' | 'windowStart' | 'windowEnd' | 'activeDays'>

/**
 * A failed request: an HTTP error with the API's own message (e.g. a validation error) when it sent one, or
 * status 0 when there was no answer at all (timed out, or no connection), with a message to show as is.
 */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// The web app is served next to the API at /api (Vite in dev, nginx in Docker). The iPhone app bundles the web app,
// so its build points at the hosted API instead: VITE_API_URL=https://api.example.com npm run build
const API_URL = import.meta.env.VITE_API_URL ?? '/api'

/** Give up on a request after this long, so a stalled connection (a tunnel, weak signal) shows an error, not a spinner forever. */
export const REQUEST_TIMEOUT_MS = 15_000
export const TIMEOUT_MESSAGE = 'NextTrain is taking too long to respond. Check your connection and try again.'
export const NETWORK_MESSAGE = "Couldn't reach NextTrain. Check your connection and try again."

// fetch with a timeout; a request that gets no answer becomes an ApiError with status 0 and a message to show.
async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (error) {
    throw new ApiError(0, (error as Error).name === 'TimeoutError' ? TIMEOUT_MESSAGE : NETWORK_MESSAGE)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(`${API_URL}${path}`, {
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

// A 30-minute Apple Maps token, signed by our API (MapKitController) so the signing key never reaches the app.
// Plain text, not JSON. No X-User-Id: the token isn't tied to a user, and a plain GET needs no CORS preflight.
export async function getMapKitToken(): Promise<string> {
  const response = await request(`${API_URL}/mapkit/token`)
  if (!response.ok) throw new ApiError(response.status, "The map isn't available right now.")
  return response.text()
}

// Anonymous per-device ID that owns this device's saved commutes.
// ponytail: whoever knows the ID can read its commutes; replace with real sign-in (e.g. Sign in with Apple) before launch.
const USER_ID_KEY = 'nexttrain.userId'
let sessionUserId: string | undefined
function userId(): string {
  try {
    let id = localStorage.getItem(USER_ID_KEY)
    if (!id) {
      id = randomId()
      localStorage.setItem(USER_ID_KEY, id)
    }
    return id
  } catch {
    return (sessionUserId ??= randomId()) // storage blocked: commutes last for this visit only
  }
}

/** After "Delete my data": the next request starts a fresh anonymous ID. */
export function forgetUserId() {
  sessionUserId = undefined
  try {
    localStorage.removeItem(USER_ID_KEY)
  } catch {
    // storage blocked: nothing stored to forget
  }
}

// randomUUID needs HTTPS; getRandomValues also works over plain HTTP (e.g. testing on a phone over Wi-Fi).
const randomId = () =>
  crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

// Fetches `path` once per page load and shares the result (reshaped by `shape`, if given); a failure allows a retry.
function fetchOnce<T, R = T>(path: string, shape?: (data: R) => T): () => Promise<T> {
  let promise: Promise<T> | undefined
  return () =>
    (promise ??= api<R>(path).then((data) => (shape ? shape(data) : (data as unknown as T))).catch((e) => {
      promise = undefined
      throw e
    }))
}

// Alerts change within minutes; pages poll them once a minute.
export const ALERTS_REFRESH_MS = 60_000
export const getAlerts = () => api<Alert[]>('/alerts')

// Routes and stations almost never change. ROUTES is subway lines then bus routes; `usePolling(getRoutes, ROUTES)`.
export const ROUTES = '/routes?type=all'
export const getRoutes = fetchOnce<Route[]>(ROUTES)
export const getStations = fetchOnce<Station[]>('/stations')

// Every bus stop that isn't a subway station (~6,600), as Stations, so search and "Near you" treat them alike.
// Searched on the device: your location never leaves the phone. Too big to keep in the offline cache (usePolling's
// `remember: false`); the browser keeps it for an hour.
export const getBusStops = fetchOnce<Station[], Omit<Station, 'routeId' | 'averageWeekdayBoardings'>[]>('/bus-stops', (stops) =>
  stops.map((s) => ({ ...s, routeId: '', averageWeekdayBoardings: null })),
)

/** A station's subway lines; none at a bus-only stop. */
export const stationRouteIds = (station: Station) => (station.routeId ? station.routeId.split(',') : [])

/** The bus routes that stop here, each once: "1:0,1:1,741:1" gives ["1", "741"]. */
export const busRouteIds = (station: Station) => [...new Set(busPairs(station).map(([route]) => route))]

/** The directions a bus route stops here in: each side of the street is its own stop, so usually just one. */
export const busDirections = (station: Station, routeId: string) => busPairs(station).filter(([route]) => route === routeId).map(([, d]) => d)

const busPairs = (station: Station) =>
  (station.busRoutes ?? '').split(',').filter(Boolean).map((pair): [string, number] => {
    const [route, direction] = pair.split(':')
    return [route, Number(direction)]
  })

/** Whether a route ID is a subway line (vs. a bus route), known even before routes load. */
export const isSubwayRoute = (routeId: string) => /^(Red|Orange|Blue|Mattapan|Green(-[A-Z])?)$/.test(routeId)

/** Where a bus stop's buses go: "1 toward Harvard Square · 47 toward Central Square". Empty for a subway station. */
export function towardLabel(station: Station, routes: Route[] | undefined, max = 2): string {
  const parts = busPairs(station).flatMap(([routeId, direction]) => {
    const route = routes?.find((r) => r.id === routeId)
    return route ? [`${route.shortName || route.id} toward ${route.directionDestinations[direction]}`] : []
  })
  return parts.length > max ? `${parts.slice(0, max).join(' · ')} · +${parts.length - max} more` : parts.join(' · ')
}

/** Live departures for one commute: its station, line, and direction. */
export const commutePredictionsPath = (c: Pick<Commute, 'mbtaStopId' | 'routeId' | 'directionId'>) =>
  `/stations/${encodeURIComponent(c.mbtaStopId)}/predictions?route=${encodeURIComponent(c.routeId)}&direction=${c.directionId}`

/**
 * A route's badge text: "RL", "GL B", "M", or a bus's number ("1", "SL1"). Shared by LineBadge and the iPhone Live
 * Activity. Bus route IDs aren't always their numbers (SL1 is "741"), so buses need the route.
 */
export const lineLabel = (routeId: string, route?: Route) =>
  !isSubwayRoute(routeId) ? (route?.shortName || routeId)
  : routeId.startsWith('Green-') ? `GL ${routeId.slice(6)}` : routeId === 'Mattapan' ? 'M' : `${routeId[0]}L`

/** A route by ID: exact, since bus route "1" must not match "10". "Green" (all branches) takes the first branch. */
export const findRoute = (routes: Route[] | undefined, routeId: string) =>
  routes?.find((r) => r.id === routeId) ?? (routeId === 'Green' ? routes?.find((r) => r.id.startsWith('Green-')) : undefined)

/** Bus routes in the groups riders know them by, each in MBTA's order: Silver Line, Crosstown, then the rest. */
export function busGroups(routes: Route[]): [title: string, routes: Route[]][] {
  const buses = routes.filter((r) => r.type === 'bus')
  const starts = (prefix: string) => (r: Route) => (r.shortName || r.id).startsWith(prefix)
  const groups: [string, Route[]][] = [
    ['Silver Line', buses.filter(starts('SL'))],
    ['Crosstown', buses.filter(starts('CT'))],
    ['Local and express', buses.filter((r) => !starts('SL')(r) && !starts('CT')(r))],
  ]
  return groups.filter(([, list]) => list.length > 0)
}

/** Routes matching what someone typed, by number ("66", "sl1") or by where they go ("harvard"). Best first. */
export function searchRoutes(routes: Route[], query: string, limit = 5): Route[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const rank = (route: Route) => {
    const number = (route.shortName || route.id).toLowerCase()
    if (number === q) return 0
    if (route.type === 'bus' && number.startsWith(q)) return 1
    if (q.length >= 3 && route.name.toLowerCase().includes(q)) return 2
    return undefined
  }
  return routes
    .filter((r) => r.type === 'bus')
    .map((route) => ({ route, rank: rank(route) }))
    .filter((r): r is { route: Route; rank: number } => r.rank !== undefined)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.route)
}

// How people type station names: "st" for Street or Saint, "sq" for Square, "ctr" for Center (or Newton Centre).
// Bus stop names abbreviate the other way ("Massachusetts Ave"), so the full words find them too.
const ALTERNATIVES: Record<string, string[]> = {
  st: ['street', 'saint'],
  sq: ['square'],
  ctr: ['center', 'centre'],
  center: ['centre', 'ctr'],
  centre: ['center'],
  govt: ['government'],
  xing: ['crossing'],
  mfa: ['museum'],
  street: ['st'],
  avenue: ['ave'],
  av: ['ave'],
  square: ['sq'],
  road: ['rd'],
  boulevard: ['blvd'],
  opposite: ['opp'],
}
// Often added to names that don't have them: "Harvard Square" for Harvard, "Park Street Station", "Mass Ave at Bow".
const OPTIONAL = new Set(['square', 'sq', 'station', 'stop', 't', 'at', 'and'])

const words = (text: string) => text.toLowerCase().replaceAll("'", '').split(/[^a-z0-9]+/).filter(Boolean)

// Each name's words, worked out once: searching ~6,600 bus stops on every keystroke has to be quick on a phone.
const wordsCache = new WeakMap<Station, string[]>()
const nameWords = (station: Station) => {
  let cached = wordsCache.get(station)
  if (!cached) wordsCache.set(station, (cached = words(station.name)))
  return cached
}

/**
 * Station search that forgives how people type. Best first: names starting with the query, then names where every
 * word of the query starts a word of the name (abbreviations and extra "square"/"station" allowed), then substrings.
 */
export function searchStations(stations: Station[], query: string, limit = 8): Station[] {
  const q = words(query)
  if (q.length === 0) return []
  const rank = (station: Station) => {
    const name = nameWords(station)
    const matches = (w: string) => name.some((n) => n.startsWith(w) || ALTERNATIVES[w]?.some((alt) => n.startsWith(alt)))
    if (name.join(' ').startsWith(q.join(' '))) return 0
    if (q.some(matches) && q.every((w) => matches(w) || OPTIONAL.has(w))) return 1
    if (name.join(' ').includes(q.join(' '))) return 2
    return undefined
  }
  return stations
    .map((station) => ({ station, rank: rank(station) }))
    .filter((r): r is { station: Station; rank: number } => r.rank !== undefined)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.station)
}
