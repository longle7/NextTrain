import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { alertsFor, majorAlert } from '../alerts'
import {
  ALERTS_REFRESH_MS, api, getAlerts, getRoutes, getStations, searchStations, stationRouteIds,
  type Alert, type Commute, type Prediction, type Route, type Station,
} from '../api'
import { commuteTiming, daysLabel, sortCommutes, timingLabel, windowLabel } from '../commutes'
import { Card, LineBadge, linkButton, primaryButton, SearchInput, StationLink, Status, WarningIcon } from '../components'
import { locationErrorMessage, nearestStations, OUT_OF_AREA_MILES, walkLabel } from '../geo'
import { recentStationIds } from '../recent'
import { countdown, groupDepartures } from '../time'
import { useNow, usePolling, useTitle } from '../usePolling'

export default function HomePage() {
  const routes = usePolling(getRoutes, 'routes')
  const stations = usePolling(getStations, 'stations')
  const navigate = useNavigate()
  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS) // one poll shared by commutes and nearby
  const [query, setQuery] = useState('')
  const results = stations.data ? searchStations(stations.data, query) : []
  const [recentIds] = useState(recentStationIds) // read once per visit to Home
  const recent = recentIds.flatMap((id) => stations.data?.find((s) => s.mbtaStopId === id) ?? [])
  useTitle(undefined)

  return (
    <>
      {/* The header shows the name; screen readers still need a page heading to start from. */}
      <h1 className="sr-only">NextTrain</h1>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search stations"
        onSubmit={() => results[0] && navigate(`/stations/${results[0].mbtaStopId}`)}
      />

      <Status error={stations.error} loading={!!query.trim() && !stations.data && !stations.error} />

      {query.trim() ? (
        <section>
          {stations.data && results.length === 0 && (
            <p className="px-1 text-neutral-500">No stations match “{query.trim()}”.</p>
          )}
          <StationList stations={results} routes={routes.data} />
        </section>
      ) : (
        <>
          <MyCommutes routes={routes.data} alerts={alerts.data} />
          {recent.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-lg font-bold">Recent</h2>
              <Card>
                <ul className="-my-1 divide-y divide-neutral-100 dark:divide-neutral-800">
                  {recent.map((station) => (
                    <li key={station.mbtaStopId} className="flex">
                      <StationLink station={station} routes={routes.data} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
          {stations.data && <Nearby stations={stations.data} routes={routes.data} alerts={alerts.data} />}
        </>
      )}
    </>
  )
}

function StationList({ stations, routes }: { stations: Station[]; routes: Route[] | undefined }) {
  return (
    <ul className="space-y-2">
      {stations.map((station) => (
        <li key={station.mbtaStopId}>
          <Card>
            <StationLink station={station} routes={routes} />
          </Card>
        </li>
      ))}
    </ul>
  )
}

type Located = { state: 'idle' | 'locating' } | { state: 'error'; message: string } | { state: 'found'; coords: GeolocationCoordinates }

function Nearby({ stations, routes, alerts }: { stations: Station[]; routes: Route[] | undefined; alerts: Alert[] | undefined }) {
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

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-lg font-bold">Near you</h2>
      {outOfArea ? (
        <Card>
          <p className="text-neutral-500">
            You're outside the MBTA subway area. Search for a station above to see its live departures.
          </p>
        </Card>
      ) : location.state === 'found' ? (
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
      ) : (
        <Card>
          <p className="text-neutral-500">
            {location.state === 'error' ? location.message : 'See the closest T stations and how far a walk they are.'}
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

// The closest station's next train each way, right on Home: the answer when you're already at the station.
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
      {predictions.error ? (
        <p className="py-1 text-sm text-neutral-500">Live times unavailable</p>
      ) : !predictions.data ? (
        <div className="my-1 h-16 rounded-lg bg-neutral-100 motion-safe:animate-pulse dark:bg-neutral-800" role="status" aria-label="Loading" />
      ) : groups.length === 0 ? (
        <p className="py-1 text-sm text-neutral-500">No trains predicted right now</p>
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
    </Link>
  )
}

function MyCommutes({ routes, alerts }: { routes: Route[] | undefined; alerts: Alert[] | undefined }) {
  const now = useNow(15_000)
  const commutes = usePolling(() => api<Commute[]>('/commutes'), 'commutes')

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">Your commutes</h2>
        {!!commutes.data?.length && (
          <Link to="/commutes/new" className={linkButton}>
            + Add
          </Link>
        )}
      </div>
      {/* One placeholder card, the size of a commute, so Home doesn't jump when they arrive. */}
      <Status error={commutes.error} loading={!commutes.data && !commutes.error} rows={1} />
      {commutes.data?.length === 0 && (
        <Card>
          <p className="text-neutral-500">Save the trips you take every day. When it's time to go, your next train shows up right here.</p>
          <Link
            to="/commutes/new"
            className={`mt-3 ${primaryButton}`}
          >
            Add a commute
          </Link>
        </Card>
      )}
      <ul className="space-y-2">
        {commutes.data &&
          sortCommutes(commutes.data, now).map((commute) => (
            <li key={commute.id}>
              <CommuteCard
                commute={commute}
                route={routes?.find((r) => r.id === commute.routeId)}
                routes={routes}
                now={now}
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

function CommuteCard({ commute, route, routes, now, alert }: {
  commute: Commute
  route: Route | undefined
  routes: Route[] | undefined
  now: Date
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
        </Link>
      </div>
      {live && <CommuteDepartures commute={commute} />}
    </Card>
  )
}

// Live only while the commute is on or about to be, so idle commutes don't spend MBTA requests.
function CommuteDepartures({ commute }: { commute: Commute }) {
  const now = useNow()
  const path = `/stations/${encodeURIComponent(commute.mbtaStopId)}/predictions?route=${encodeURIComponent(commute.routeId)}&direction=${commute.directionId}`
  const predictions = usePolling(() => api<Prediction[]>(path), path, 10_000)
  const departures = predictions.data ? (groupDepartures(predictions.data, now)[0]?.departures ?? []) : []

  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <span className="text-sm font-semibold text-neutral-500">Next train</span>
      {predictions.error ? (
        <span className="text-sm text-neutral-500">Live times unavailable</span>
      ) : !predictions.data ? (
        <span className="h-7 w-24 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800" aria-label="Loading" />
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
  )
}
