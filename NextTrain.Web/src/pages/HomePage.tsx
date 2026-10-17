import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { alertsFor, majorAlert, plannedFor } from '../alerts'
import {
  ALERTS_REFRESH_MS, api, commutePredictionsPath, connectionsPath, findRoute, getAlerts, getBusStops, getRoutes, getStations, isSubwayRoute, ROUTES,
  searchRoutes, searchStations, stationRouteIds, towardLabel, UPCOMING_REFRESH_MS, upcomingAlertsPath,
  type Alert, type Commute, type ConnectionPlan, type Prediction, type Route, type Station,
} from '../api'
import { readKey, writeKey } from '../cache'
import { commuteTiming, daysLabel, GET_STARTED_KEY, getStartedDue, liveActivityEnd, sortCommutes, timingLabel, windowLabel } from '../commutes'
import { Card, LineBadge, linkButton, primaryButton, SearchInput, secondaryButton, StationLink, Status, WarningIcon } from '../components'
import { currentPosition, locationErrorMessage, locationRemembered, nearestStations, OUT_OF_AREA_MILES, walkLabel } from '../geo'
import { endLiveActivities, liveActivityDetails, showLiveActivity, updateWidget, widgetCommutes } from '../liveActivity'
import { TERMS_ACCEPTED, termsAccepted } from '../legal'
import { declineNotifications, notificationChoice, notificationsAvailable, turnOnNotifications } from '../notifications'
import { placeOf, suggestPlaces, type Suggestion } from '../places'
import { clock, dateRange, departureLabel, groupDepartures, secondsAgo, STALE_AFTER_SECONDS } from '../time'
import { adviceText } from '../transfers'
import { failure, useNow, usePolling, useTitle } from '../usePolling'

export default function HomePage() {
  const routes = usePolling(getRoutes, ROUTES)
  const stations = usePolling(getStations, 'stations')
  const busStops = usePolling(getBusStops, '/bus-stops', undefined, { remember: false }) // ~1 MB: the browser caches it
  const navigate = useNavigate()
  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS) // one poll shared by commutes and nearby
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Suggestion[]>([])
  // Stations first, then bus routes by number ("66"), then bus stops, then addresses and places.
  const results = stations.data ? searchStations(stations.data, query) : []
  const routeResults = routes.data ? searchRoutes(routes.data, query) : []
  // "66" means route 66, not 665 Broadway: an exact route number shows just the route.
  const exactRoute = routeResults.some((r) => (r.shortName || r.id).toLowerCase() === query.trim().toLowerCase())
  const stopResults = busStops.data && !exactRoute ? searchStations(busStops.data, query, 6) : []
  const placeResults = exactRoute || !query.trim() ? [] : places
  const nothingFound = !!stations.data && !!busStops.data && results.length + routeResults.length + stopResults.length + placeResults.length === 0
  useTitle(undefined)

  // Apple's addresses and places, a moment after typing stops (places.ts; MapKit loads on the first one).
  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    const timer = setTimeout(() => void suggestPlaces(query, []).then((found) => !cancelled && setPlaces(found)), 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  // A place opens the trip planner to there, with where it is, so the planner needn't look it up again.
  const planTo = async (suggestion: Suggestion) => {
    const place = await placeOf(suggestion).catch(() => undefined)
    const at = place ? `&lat=${place.latitude}&lon=${place.longitude}` : ''
    navigate(`/trip?to=${encodeURIComponent(place?.name ?? suggestion.name)}${at}`)
  }

  const openTopResult = () => {
    if (results[0]) navigate(`/stations/${results[0].mbtaStopId}`)
    else if (routeResults[0]) navigate(`/lines/${routeResults[0].id}`)
    else if (stopResults[0]) navigate(`/stations/${stopResults[0].mbtaStopId}`)
    else if (placeResults[0]) void planTo(placeResults[0])
  }

  return (
    <>
      {/* The header shows the name; screen readers still need a page heading to start from. */}
      <h1 className="sr-only">NextTrain</h1>
      {/* One search: a station, stop, or bus route opens its page; an address or place plans a trip there. */}
      <SearchInput value={query} onChange={setQuery} placeholder="Search a station, bus, or address" onSubmit={openTopResult} />

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
          {placeResults.length > 0 && (
            <ResultGroup title="Places: plan a trip">
              <ul className="space-y-2">
                {placeResults.map((place) => (
                  <li key={`${place.name}|${place.detail}`}>
                    <button onClick={() => void planTo(place)} className="block w-full rounded-xl bg-white p-4 text-left shadow-sm dark:bg-neutral-900">
                      <span className="block font-medium">{place.name}</span>
                      {place.detail && <span className="block text-sm text-neutral-500">{place.detail}</span>}
                    </button>
                  </li>
                ))}
              </ul>
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

// New here (no commutes yet): the three things NextTrain does, each one tap away, and why a commute is worth saving.
// Gone once a commute is saved.
// iPhone app, once there's a commute: offer delay notifications, until the rider answers (Settings can change it).
function NotificationsPrompt() {
  const [asked, setAsked] = useState(() => !notificationsAvailable() || notificationChoice() !== null)
  if (asked) return null
  const turnOn = async () => {
    await turnOnNotifications().catch(() => false)
    setAsked(true) // iOS asked once; turned down there, Settings explains how to turn them on
  }
  const notNow = () => {
    declineNotifications()
    setAsked(true)
  }
  return (
    <Card>
      <p className="font-bold">Get delay alerts?</p>
      <p className="mt-1 text-sm text-neutral-500">
        NextTrain can notify you when a suspension, closure, or long delay hits one of your commutes, from 30 minutes before
        it starts. Change this anytime in Settings.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={notNow} className={secondaryButton}>
          Not now
        </button>
        <button onClick={turnOn} className={primaryButton}>
          Turn on
        </button>
      </div>
    </Card>
  )
}

// The nudge to save a commute, for someone who has none: once a day, on up to 3 days (commutes.ts getStartedDue). Only
// after the Terms are agreed, so it never stacks on the Welcome screen; on a first launch it follows right after.
function GetStartedPopup() {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const show = () => {
      const next = termsAccepted() ? getStartedDue(readKey(GET_STARTED_KEY), bostonDay(new Date())) : undefined
      if (!next || !dialog.current || dialog.current.open) return
      writeKey(GET_STARTED_KEY, next)
      dialog.current.showModal()
    }
    show()
    window.addEventListener(TERMS_ACCEPTED, show)
    return () => window.removeEventListener(TERMS_ACCEPTED, show)
  }, [])
  return (
    <dialog
      ref={dialog}
      aria-labelledby="get-started-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-neutral-900 shadow-xl backdrop:bg-black/60 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <div className="space-y-4">
        <h2 id="get-started-title" className="text-xl font-bold">
          Save your commute
        </h2>
        <p>Save the trip you take every day, and its next train or bus shows up right here.</p>
        <Link to="/commutes/new" className={primaryButton}>
          Add a commute
        </Link>
        <button onClick={() => dialog.current?.close()} className={`w-full justify-center ${linkButton}`}>
          Not now
        </button>
      </div>
    </dialog>
  )
}

// "2026-10-17", in Boston: a day starts at Boston's midnight wherever the phone is set.
const bostonDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date)

function Nearby({ stations, busStops, routes, alerts }: {
  stations: Station[]
  busStops: Station[] | undefined
  routes: Route[] | undefined
  alerts: Alert[] | undefined
}) {
  // Once the rider has used their location here, Home finds them without a tap. (The iPhone app's web view doesn't
  // answer the permissions query below, hence remembering it.)
  const [location, setLocation] = useState<Located>(() => (locationRemembered() ? { state: 'locating' } : { state: 'idle' }))

  const locate = () => {
    setLocation({ state: 'locating' })
    find()
  }
  const find = () =>
    currentPosition().then(
      (coords) => setLocation({ state: 'found', coords }),
      (error: GeolocationPositionError) => setLocation({ state: 'error', message: locationErrorMessage(error) }),
    )

  // Skip the button if location was used here before, or the browser says it's allowed.
  useEffect(() => {
    if (locationRemembered()) return void find()
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
  const path = `/stations/${encodeURIComponent(station.mbtaStopId)}/predictions?schedules=true`
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
              <span className="shrink-0 text-right">
                <span className="font-bold tabular-nums">{departureLabel(g.departures[0], g.scheduled, now)}</span>
                {g.scheduled && <span className="block text-xs text-neutral-500">Scheduled</span>}
              </span>
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
  // Planned changes in the next week (subway, plus your bus commutes' routes), once there are commutes.
  const hasCommutes = !!commutes.data?.length
  const upcomingPath = upcomingAlertsPath()
  const upcomingSubway = usePolling(() => (hasCommutes ? api<Alert[]>(upcomingPath) : Promise.resolve([])), `${upcomingPath}|${hasCommutes}`, UPCOMING_REFRESH_MS)
  const upcomingBusPath = upcomingAlertsPath(busRoutes)
  const upcomingBus = usePolling(() => (busRoutes ? api<Alert[]>(upcomingBusPath) : Promise.resolve([])), upcomingBusPath, UPCOMING_REFRESH_MS)
  const upcoming = [...(upcomingSubway.data ?? []), ...(upcomingBus.data ?? [])]
  const sorted = commutes.data && sortCommutes(commutes.data, now)
  // The iPhone Live Activity follows the soonest commute that's on, or starts within 15 minutes.
  const liveId = sorted?.find((c) => liveActivityEnd(c, now))?.id
  const loaded = sorted !== undefined
  useEffect(() => {
    if (loaded && liveId === undefined) void endLiveActivities()
  }, [loaded, liveId])
  // The Home Screen widget shows these commutes too (iPhone app only), sent again only when they change.
  const widget = commutes.data && routes && JSON.stringify(widgetCommutes(commutes.data, routes))
  useEffect(() => {
    if (widget) void updateWidget(JSON.parse(widget))
  }, [widget])

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
      {/* No commute yet: adding one is the thing to do here (the small "+ Add" above takes over once there's one). */}
      {commutes.data?.length === 0 && (
        <>
          <Link to="/commutes/new" className={primaryButton}>
            <span aria-hidden>+</span> Add a commute
          </Link>
          <GetStartedPopup />
        </>
      )}
      {hasCommutes && <NotificationsPrompt />}
      {/* The commute that's on (or next) in full, with its live times; the others one line each, until their turn. */}
      <ul className="space-y-2">
        {sorted?.map((commute, i) => {
          const route = routes?.find((r) => r.id === commute.routeId)
          const scope = { routeIds: [commute.routeId], stopId: commute.mbtaStopId, directionId: commute.directionId }
          const alert = alerts && majorAlert(alertsFor(alerts, scope))
          return (
            <li key={commute.id}>
              {i === 0 ? (
                <CommuteCard
                  commute={commute}
                  route={route}
                  routes={routes}
                  now={now}
                  liveActivity={commute.id === liveId}
                  alert={alert}
                  planned={plannedFor(upcoming, scope, commute.activeDays, now)}
                />
              ) : (
                <CommuteRow commute={commute} route={route} routes={routes} now={now} alert={alert} />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CommuteCard({ commute, route, routes, now, liveActivity, alert, planned }: {
  commute: Commute
  route: Route | undefined
  routes: Route[] | undefined
  now: Date
  liveActivity: boolean // this commute drives the iPhone Live Activity
  alert: Alert | undefined // the worst service alert on this commute's line, station, and direction
  planned: Alert | undefined // the soonest planned change that will hit this commute within a week
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
        {commute.transferStopId && commute.transferRouteId && (
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
            {commute.transferFromStationName
              ? `Get off at ${commute.transferFromStationName}, walk to ${commute.transferStationName} for`
              : `Change at ${commute.transferStationName} to`}
            <LineBadge routeId={commute.transferRouteId} routes={routes} />
            {findRoute(routes, commute.transferRouteId)?.directionDestinations[commute.transferDirectionId ?? 0] ?? '…'}
          </p>
        )}
        {alert && (
          <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <WarningIcon className="mt-0.5 size-4 shrink-0" />
            {alert.summary}
          </p>
        )}
        {planned && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
            <CalendarIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">Planned:</span> {planned.summary} · {dateRange(planned.start!, planned.end)}
            </span>
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
      {live && <CommuteDepartures commute={commute} route={route} routes={routes} alert={alert} liveActivity={liveActivity} />}
    </Card>
  )
}

// A commute that isn't the one on now: one line, tap for its station. It opens in full once it's the next one.
function CommuteRow({ commute, route, routes, now, alert }: {
  commute: Commute
  route: Route | undefined
  routes: Route[] | undefined
  now: Date
  alert: Alert | undefined
}) {
  const destination = route?.directionDestinations[commute.directionId] ?? '…'
  return (
    <Card>
      <div className="-my-1 flex items-center gap-2">
        <Link to={`/stations/${commute.mbtaStopId}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5">
          <LineBadge routeId={commute.routeId} routes={routes} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {commute.stationName} <span className="font-normal text-neutral-600 dark:text-neutral-300">to {destination}</span>
            </span>
            <span className="block truncate text-sm text-neutral-500">
              {daysLabel(commute.activeDays)} · {timingLabel(commuteTiming(commute, now), now)}
            </span>
          </span>
          {alert && (
            <span className="shrink-0 text-amber-700 dark:text-amber-400">
              <WarningIcon className="size-5" />
              <span className="sr-only">{alert.summary}</span>
            </span>
          )}
        </Link>
        <Link to={`/commutes/${commute.id}`} className={`-mr-2 shrink-0 text-sm ${linkButton}`}>
          Edit
          <span className="sr-only">
            {' '}commute: {commute.stationName} to {destination}
          </span>
        </Link>
      </div>
    </Card>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-none stroke-current stroke-2 ${className ?? ''}`} aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  )
}

// Live only while the commute is on or about to be, so idle commutes don't spend MBTA requests.
function CommuteDepartures({ commute, route, routes, alert, liveActivity }: {
  commute: Commute
  route: Route | undefined
  routes: Route[] | undefined
  alert: Alert | undefined
  liveActivity: boolean
}) {
  const now = useNow()
  const path = `${commutePredictionsPath(commute)}&schedules=true`
  const predictions = usePolling(() => api<Prediction[]>(path), path, 10_000)
  // With a change of line: which connection the next trains make, and whether to hurry.
  const connections = connectionsPath(commute)
  const plan = usePolling(() => (connections ? api<ConnectionPlan>(connections) : Promise.resolve(undefined)), connections ?? 'no-transfer', 10_000, {
    remember: false, // old advice misleads
  })
  const advice = plan.data && commute.transferRouteId && commute.transferStationName
    ? adviceText(plan.data, findRoute(routes, commute.transferRouteId), commute.transferStationName, now)
    : undefined
  const next = predictions.data ? groupDepartures(predictions.data, now)[0] : undefined
  const departures = next?.departures ?? []
  const scheduled = !!next?.scheduled
  const bus = route?.type === 'bus'

  // Send the Live Activity the same trains as this card, only when they change (a train left, or new predictions).
  // Live times only: a Lock Screen countdown to a timetable time would look live.
  const endsAt = liveActivity ? liveActivityEnd(commute, now) : undefined
  const details = endsAt && predictions.data ? liveActivityDetails(commute, route, scheduled ? [] : departures, endsAt, alert) : undefined
  const detailsKey = details && JSON.stringify(details)
  useEffect(() => {
    if (detailsKey) void showLiveActivity(JSON.parse(detailsKey))
  }, [detailsKey])

  return (
    <>
      <div className="flex min-h-12 items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <span className="text-sm font-semibold text-neutral-500">{bus ? 'Next bus' : 'Next train'}</span>
        {!predictions.data ? (
          predictions.error ? (
            <span className="text-sm text-neutral-500">Live times unavailable</span>
          ) : (
            <span className="h-7 w-24 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800" aria-label="Loading" />
          )
        ) : departures.length === 0 ? (
          <span className="text-sm text-neutral-500">{bus ? 'No buses' : 'No trains'} predicted right now</span>
        ) : (
          <span className="text-right">
            <span className="text-2xl font-bold tabular-nums">{departureLabel(departures[0], scheduled, now)}</span>
            {(scheduled || departures.length > 1) && (
              <span className="block text-sm text-neutral-500">
                {[scheduled && 'Scheduled', departures.length > 1 && `then ${departures.slice(1).map((t) => departureLabel(t, scheduled, now)).join(', ')}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </span>
        )}
      </div>
      {advice && (
        <p
          className={`mt-2 text-sm ${advice.tone === 'hurry' ? 'font-semibold text-amber-700 dark:text-amber-400' : advice.tone === 'calm' ? 'font-semibold text-green-700 dark:text-green-400' : 'text-neutral-600 dark:text-neutral-300'}`}
        >
          {advice.text}
        </p>
      )}
      <LastUpdated at={predictions.updatedAt} now={now} />
    </>
  )
}

// Times older than a couple of refreshes, e.g. NextTrain opened offline in a tunnel, showing the last ones it had.
function LastUpdated({ at, now }: { at: Date | undefined; now: Date }) {
  if (!at || secondsAgo(at, now) <= STALE_AFTER_SECONDS) return null
  return <p className="text-right text-xs text-amber-700 dark:text-amber-400">Last updated {clock(at)}. Times may be out of date.</p>
}
