import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { alertsFor, majorAlert } from '../alerts'
import {
  ALERTS_REFRESH_MS, api, commutePredictionsPath, getAlerts, getBusStops, getRoutes, getStations, isSubwayRoute, ROUTES,
  searchRoutes, searchStations, stationRouteIds, towardLabel,
  type Alert, type Commute, type Prediction, type Route, type Station,
} from '../api'
import { commuteTiming, daysLabel, liveActivityEnd, sortCommutes, timingLabel, windowLabel } from '../commutes'
import { Card, LineBadge, linkButton, primaryButton, SearchInput, StationLink, Status, WarningIcon } from '../components'
import { locationErrorMessage, nearestStations, OUT_OF_AREA_MILES, walkLabel } from '../geo'
import { endLiveActivities, liveActivityDetails, showLiveActivity } from '../liveActivity'
import { clock, countdown, groupDepartures, secondsAgo, STALE_AFTER_SECONDS } from '../time'
import { failure, useNow, usePolling, useTitle } from '../usePolling'

export default function HomePage() {
  const routes = usePolling(getRoutes, ROUTES)
  const stations = usePolling(getStations, 'stations')
  const busStops = usePolling(getBusStops, '/bus-stops', undefined, { remember: false }) // ~1 MB: the browser caches it
  const navigate = useNavigate()
  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS) // one poll shared by commutes and nearby
  const [query, setQuery] = useState('')
  // Stations first, then bus routes by number ("66"), then bus stops.
  const results = stations.data ? searchStations(stations.data, query) : []
  const routeResults = routes.data ? searchRoutes(routes.data, query) : []
  // "66" means route 66, not 665 Broadway: an exact route number shows just the route.
  const exactRoute = routeResults.some((r) => (r.shortName || r.id).toLowerCase() === query.trim().toLowerCase())
  const stopResults = busStops.data && !exactRoute ? searchStations(busStops.data, query, 6) : []
  const nothingFound = !!stations.data && !!busStops.data && results.length + routeResults.length + stopResults.length === 0
  useTitle(undefined)

  const openTopResult = () => {
    if (results[0]) navigate(`/stations/${results[0].mbtaStopId}`)
    else if (routeResults[0]) navigate(`/lines/${routeResults[0].id}`)
    else if (stopResults[0]) navigate(`/stations/${stopResults[0].mbtaStopId}`)
  }

  return (
    <>
      {/* The header shows the name; screen readers still need a page heading to start from. */}
      <h1 className="sr-only">NextTrain</h1>
      <SearchInput value={query} onChange={setQuery} placeholder="Search stations, stops, or bus routes" onSubmit={openTopResult} />

      <Status error={failure(stations)} loading={!!query.trim() && !stations.data && !stations.error} />

      {query.trim() ? (
        <section className="space-y-4">
          {nothingFound && <p className="px-1 text-neutral-500">Nothing matches “{query.trim()}”.</p>}
          <StationList stations={results} routes={routes.data} />
          {routeResults.length > 0 && (
            <ResultGroup title="Bus routes">
              <RouteList routes={routeResults} />
            </ResultGroup>
          )}
          {stopResults.length > 0 && (
            <ResultGroup title="Bus stops">
              <StationList stations={stopResults} routes={routes.data} />
            </ResultGroup>
          )}
        </section>
      ) : (
        <>
          <MyCommutes routes={routes.data} alerts={alerts.data} />
          {stations.data ? (
            <Nearby stations={stations.data} busStops={busStops.data} routes={routes.data} alerts={alerts.data} />
          ) : (
            // Keeps Home's layout steady while stations load, instead of the section popping in. (A failure already
            // shows at the top of the page.)
            !stations.error && (
              <section id="near-you" className="space-y-2">
                <h2 className="px-1 text-lg font-bold">Near you</h2>
                <Status loading rows={1} />
              </section>
            )
          )}
        </>
      )}
    </>
  )
}

// A bus stop also says where its buses go ("1 toward Harvard Square"): each side of the street is its own stop.
function StationList({ stations, routes }: { stations: Station[]; routes: Route[] | undefined }) {
  return (
    <ul className="space-y-2">
      {stations.map((station) => (
        <li key={station.mbtaStopId}>
          <Card>
            <StationLink station={station} routes={routes} detail={towardLabel(station, routes) || undefined} />
          </Card>
        </li>
      ))}
    </ul>
  )
}

function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="px-1 text-sm font-bold text-neutral-500">{title}</h2>
      {children}
    </div>
  )
}

function RouteList({ routes }: { routes: Route[] }) {
  return (
    <ul className="space-y-2">
      {routes.map((route) => (
        <li key={route.id}>
          <Card to={`/lines/${route.id}`}>
            <span className="flex items-center gap-3">
              <LineBadge routeId={route.id} routes={routes} />
              <span className="min-w-0 flex-1 truncate font-medium">{route.name}</span>
            </span>
          </Card>
        </li>
      ))}
    </ul>
  )
}

type Located = { state: 'idle' | 'locating' } | { state: 'error'; message: string } | { state: 'found'; coords: GeolocationCoordinates }

// Bus stops farther than this aren't "near you" (about a 12-minute walk).
const BUS_STOP_MILES = 0.5

// New here (no commutes yet): the three things NextTrain does, each one tap away. Gone once a commute is saved.
function GetStarted() {
  const search = () => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  // Lands on "Use my location", so the location prompt comes from the rider's own tap on it.
  const nearby = () => {
    const section = document.getElementById('near-you')
    section?.scrollIntoView({ block: 'start' })
    section?.querySelector('button')?.focus({ preventScroll: true })
  }
  const step = 'flex min-h-11 w-full items-center gap-3 text-left'
  const number = (n: number) => (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-600 text-sm text-white dark:bg-blue-400 dark:text-neutral-900">
      {n}
    </span>
  )
  return (
    <Card>
      <p className="font-bold">Get started</p>
      <ol className="mt-2 space-y-1">
        <li>
          <button onClick={search} className={`${step} font-semibold`}>
            {number(1)}Search for a station, stop, or bus route
          </button>
        </li>
        <li>
          <button onClick={nearby} className={`${step} font-semibold`}>
            {number(2)}See what's near you
          </button>
        </li>
        <li>
          {/* Not a button: the Add a commute button below is the way in. */}
          <span className={`${step} text-neutral-600 dark:text-neutral-300`}>
            {number(3)}Save the trip you take every day, and its next train or bus shows up here
          </span>
        </li>
      </ol>
      <Link to="/commutes/new" className={`mt-3 ${primaryButton}`}>
        Add a commute
      </Link>
    </Card>
  )
}

function Nearby({ stations, busStops, routes, alerts }: {
  stations: Station[]
  busStops: Station[] | undefined
  routes: Route[] | undefined
  alerts: Alert[] | undefined
}) {
  const [location, setLocation] = useState<Located>({ state: 'idle' })

  const locate = () => {
    setLocation({ state: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({ state: 'found', coords: position.coords }),
      (error) => setLocation({ state: 'error', message: locationErrorMessage(error) }),
      { maximumAge: 60_000, timeout: 15_000 },
    )
  }

  // Skip the button if the user already allowed location.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => p.state === 'granted' && locate())
      .catch(() => {})
  }, [])

  const nearest = location.state === 'found' ? nearestStations(stations, location.coords) : []
  const outOfArea = nearest.length > 0 && nearest[0].miles > OUT_OF_AREA_MILES
  // Worked out on the device, like the stations: your location never leaves the phone.
  const nearbyStops =
    location.state === 'found' && busStops
      ? nearestStations(busStops, location.coords, 4).filter(({ miles }) => miles <= BUS_STOP_MILES)
      : []

  return (
    <section id="near-you" className="space-y-2">
      <h2 className="px-1 text-lg font-bold">Near you</h2>
      {outOfArea ? (
        <Card>
          <p className="text-neutral-500">
            You're outside the MBTA area. Search for a station or bus stop above to see its live departures.
          </p>
        </Card>
      ) : location.state === 'found' ? (
        <>
          <ul className="space-y-2">
            {nearest.map(({ station, miles }, i) => (
              <li key={station.mbtaStopId}>
                <Card>
                  <StationLink station={station} routes={routes} detail={walkLabel(miles)} />
                  {i === 0 && <NextTrains station={station} routes={routes} alerts={alerts} />}
                </Card>
              </li>
            ))}
          </ul>
          {nearbyStops.length > 0 && (
            <>
              <h3 className="px-1 pt-2 font-bold">Bus stops</h3>
              <ul className="space-y-2">
                {nearbyStops.map(({ station, miles }, i) => (
                  <li key={station.mbtaStopId}>
                    <Card>
                      <StationLink
                        station={station}
                        routes={routes}
                        detail={[walkLabel(miles), towardLabel(station, routes)].filter(Boolean).join(' · ')}
                      />
                      {i === 0 && <NextTrains station={station} routes={routes} alerts={alerts} />}
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <Card>
          <p className="text-neutral-500">
            {location.state === 'error' ? location.message : 'See the closest T stations and bus stops, and how far a walk they are.'}
          </p>
          <button
            onClick={locate}
            disabled={location.state === 'locating'}
            className={`mt-3 ${primaryButton}`}
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2" aria-hidden>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="6" />
            </svg>
            {location.state === 'locating' ? 'Finding you…' : 'Use my location'}
          </button>
        </Card>
      )}
    </section>
  )
}

// The closest station's next train each way (or bus stop's next buses), right on Home: the answer when you're already there.
const NEARBY_ROWS = 6

function NextTrains({ station, routes, alerts }: { station: Station; routes: Route[] | undefined; alerts: Alert[] | undefined }) {
  const now = useNow()
  const path = `/stations/${encodeURIComponent(station.mbtaStopId)}/predictions`
  const predictions = usePolling(() => api<Prediction[]>(path), path, 10_000)
  const groups = predictions.data ? groupDepartures(predictions.data, now, 1) : []
  const alert = alerts && majorAlert(alertsFor(alerts, { routeIds: stationRouteIds(station), stopId: station.mbtaStopId }))

  return (
    <Link to={`/stations/${station.mbtaStopId}`} className="mt-2 block border-t border-neutral-100 pt-2 dark:border-neutral-800">
      {alert && (
        <p className="flex items-start gap-1.5 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
          <WarningIcon className="mt-0.5 size-4 shrink-0" />
          {alert.summary}
        </p>
      )}
      {!predictions.data ? (
        predictions.error ? (
          <p className="py-1 text-sm text-neutral-500">Live times unavailable</p>
        ) : (
          <div className="my-1 h-16 rounded-lg bg-neutral-100 motion-safe:animate-pulse dark:bg-neutral-800" role="status" aria-label="Loading" />
        )
      ) : groups.length === 0 ? (
        <p className="py-1 text-sm text-neutral-500">{station.routeId ? 'No trains predicted right now' : 'No buses predicted right now'}</p>
      ) : (
        <ul>
          {groups.slice(0, NEARBY_ROWS).map((g) => (
            <li key={`${g.routeId}|${g.directionId}`} className="flex items-center justify-between gap-2 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <LineBadge routeId={g.routeId} routes={routes} />
                <span className="truncate">to {routes?.find((r) => r.id === g.routeId)?.directionDestinations[g.directionId] ?? '…'}</span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">{countdown(g.departures[0], now)}</span>
            </li>
          ))}
          {groups.length > NEARBY_ROWS && <li className="pt-1 text-sm font-semibold text-blue-600 dark:text-blue-400">All departures ›</li>}
        </ul>
      )}
      <LastUpdated at={predictions.updatedAt} now={now} />
    </Link>
  )
}

function MyCommutes({ routes, alerts: subwayAlerts }: { routes: Route[] | undefined; alerts: Alert[] | undefined }) {
  const now = useNow(15_000)
  const commutes = usePolling(() => api<Commute[]>('/commutes'), 'commutes')
  // Bus alerts only come per route (there are too many to load them all): the ones for your bus commutes.
  const busRoutes = [...new Set(commutes.data?.map((c) => c.routeId).filter((id) => !isSubwayRoute(id)))].sort().join(',')
  const busAlertsPath = `/alerts?routes=${encodeURIComponent(busRoutes)}`
  const busAlerts = usePolling(() => (busRoutes ? api<Alert[]>(busAlertsPath) : Promise.resolve([])), busAlertsPath, ALERTS_REFRESH_MS)
  const alerts = subwayAlerts && [...subwayAlerts, ...(busAlerts.data ?? [])]
  const sorted = commutes.data && sortCommutes(commutes.data, now)
  // The iPhone Live Activity follows the soonest commute that's on, or starts within 15 minutes.
  const liveId = sorted?.find((c) => liveActivityEnd(c, now))?.id
  const loaded = sorted !== undefined
  useEffect(() => {
    if (loaded && liveId === undefined) void endLiveActivities()
  }, [loaded, liveId])

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">Your commutes</h2>
        {!!commutes.data?.length && (
          <Link to="/commutes/new" className={linkButton}>
            {/* Heard as "Add a commute"; the name still contains the visible "Add" (WCAG 2.5.3). */}
            <span aria-hidden>+&nbsp;</span>Add<span className="sr-only"> a commute</span>
          </Link>
        )}
      </div>
      {/* One placeholder card, the size of a commute, so Home doesn't jump when they arrive. */}
      <Status error={failure(commutes)} loading={!commutes.data && !commutes.error} rows={1} />
      {commutes.data?.length === 0 && <GetStarted />}
      <ul className="space-y-2">
        {sorted?.map((commute) => (
          <li key={commute.id}>
            <CommuteCard
              commute={commute}
              route={routes?.find((r) => r.id === commute.routeId)}
              routes={routes}
              now={now}
              liveActivity={commute.id === liveId}
              alert={
                alerts &&
                majorAlert(alertsFor(alerts, { routeIds: [commute.routeId], stopId: commute.mbtaStopId, directionId: commute.directionId }))
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CommuteCard({ commute, route, routes, now, liveActivity, alert }: {
  commute: Commute
  route: Route | undefined
  routes: Route[] | undefined
  now: Date
  liveActivity: boolean // this commute drives the iPhone Live Activity
  alert: Alert | undefined // the worst service alert on this commute's line, station, and direction
}) {
  const timing = commuteTiming(commute, now)
  const live = timing.state === 'now' || timing.state === 'soon'
  return (
    <Card>
      <Link to={`/stations/${commute.mbtaStopId}`} className="block">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <LineBadge routeId={commute.routeId} routes={routes} />
            <span className="truncate font-semibold">{commute.stationName}</span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${live ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            {timingLabel(timing, now)}
          </span>
        </div>
        <p className="mt-1 font-medium">to {route?.directionDestinations[commute.directionId] ?? '…'}</p>
        {alert && (
          <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <WarningIcon className="mt-0.5 size-4 shrink-0" />
            {alert.summary}
          </p>
        )}
      </Link>
      <div className="flex items-center justify-between gap-2 text-sm text-neutral-500">
        <span>
          {daysLabel(commute.activeDays)} · {windowLabel(commute)}
        </span>
        <Link to={`/commutes/${commute.id}`} className={`-mr-2 ${linkButton}`}>
          Edit
          {/* Out of context (e.g. a screen reader's list of links) "Edit" alone doesn't say which commute. */}
          <span className="sr-only">
            {' '}commute: {commute.stationName} to {route?.directionDestinations[commute.directionId] ?? ''}
          </span>
        </Link>
      </div>
      {live && <CommuteDepartures commute={commute} route={route} alert={alert} liveActivity={liveActivity} />}
    </Card>
  )
}

// Live only while the commute is on or about to be, so idle commutes don't spend MBTA requests.
function CommuteDepartures({ commute, route, alert, liveActivity }: {
  commute: Commute
  route: Route | undefined
  alert: Alert | undefined
  liveActivity: boolean
}) {
  const now = useNow()
  const path = commutePredictionsPath(commute)
  const predictions = usePolling(() => api<Prediction[]>(path), path, 10_000)
  const departures = predictions.data ? (groupDepartures(predictions.data, now)[0]?.departures ?? []) : []

  // Send the Live Activity the same trains as this card, only when they change (a train left, or new predictions).
  const endsAt = liveActivity ? liveActivityEnd(commute, now) : undefined
  const details = endsAt && predictions.data ? liveActivityDetails(commute, route, departures, endsAt, alert) : undefined
  const detailsKey = details && JSON.stringify(details)
  useEffect(() => {
    if (detailsKey) void showLiveActivity(JSON.parse(detailsKey))
  }, [detailsKey])

  return (
    <>
      <div className="flex min-h-12 items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <span className="text-sm font-semibold text-neutral-500">Next train</span>
        {!predictions.data ? (
          predictions.error ? (
            <span className="text-sm text-neutral-500">Live times unavailable</span>
          ) : (
            <span className="h-7 w-24 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800" aria-label="Loading" />
          )
        ) : departures.length === 0 ? (
          <span className="text-sm text-neutral-500">No trains predicted right now</span>
        ) : (
          <span className="text-right">
            <span className="text-2xl font-bold tabular-nums">{countdown(departures[0], now)}</span>
            {departures.length > 1 && (
              <span className="block text-sm text-neutral-500">then {departures.slice(1).map((t) => countdown(t, now)).join(', ')}</span>
            )}
          </span>
        )}
      </div>
      <LastUpdated at={predictions.updatedAt} now={now} />
    </>
  )
}

// Times older than a couple of refreshes, e.g. NextTrain opened offline in a tunnel, showing the last ones it had.
function LastUpdated({ at, now }: { at: Date | undefined; now: Date }) {
  if (!at || secondsAgo(at, now) <= STALE_AFTER_SECONDS) return null
  return <p className="text-right text-xs text-amber-700 dark:text-amber-400">Last updated {clock(at)}. Times may be out of date.</p>
}
