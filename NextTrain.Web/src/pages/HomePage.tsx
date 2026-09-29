import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { alertsFor, majorAlert } from '../alerts'
import {
  ALERTS_REFRESH_MS, api, getAlerts, getRoutes, getStations, searchStations,
  type Alert, type Commute, type Prediction, type Route, type Station,
} from '../api'
import { commuteTiming, daysLabel, sortCommutes, timingLabel, windowLabel } from '../commutes'
import { Card, LineBadge, linkButton, primaryButton, SearchInput, StationLink, Status, WarningIcon } from '../components'
import { locationErrorMessage, nearestStations, OUT_OF_AREA_MILES, walkLabel } from '../geo'
import { countdown, groupDepartures } from '../time'
import { useNow, usePolling } from '../usePolling'

export default function HomePage() {
  const routes = usePolling(getRoutes, 'routes')
  const stations = usePolling(getStations, 'stations')
  const [query, setQuery] = useState('')
  const results = stations.data ? searchStations(stations.data, query) : []

  return (
    <>
      <SearchInput value={query} onChange={setQuery} placeholder="Search stations" />

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
          <MyCommutes routes={routes.data} />
          {stations.data && <Nearby stations={stations.data} routes={routes.data} />}
        </>
      )}
    </>
  )
}

function StationList({ stations, routes, details }: { stations: Station[]; routes: Route[] | undefined; details?: string[] }) {
  return (
    <ul className="space-y-2">
      {stations.map((station, i) => (
        <li key={station.mbtaStopId}>
          <Card>
            <StationLink station={station} routes={routes} detail={details?.[i]} />
          </Card>
        </li>
      ))}
    </ul>
  )
}

type Located = { state: 'idle' | 'locating' } | { state: 'error'; message: string } | { state: 'found'; coords: GeolocationCoordinates }

function Nearby({ stations, routes }: { stations: Station[]; routes: Route[] | undefined }) {
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
        <StationList
          stations={nearest.map((n) => n.station)}
          routes={routes}
          details={nearest.map((n) => walkLabel(n.miles))}
        />
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

function MyCommutes({ routes }: { routes: Route[] | undefined }) {
  const now = useNow(15_000)
  const commutes = usePolling(() => api<Commute[]>('/commutes'), 'commutes')
  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS)

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
      <Status error={commutes.error} />
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
                  alerts.data &&
                  majorAlert(
                    alertsFor(alerts.data, { routeIds: [commute.routeId], stopId: commute.mbtaStopId, directionId: commute.directionId }),
                  )
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
