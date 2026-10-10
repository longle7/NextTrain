import { Link, useParams } from 'react-router'
import { alertsFor, majorAlert } from '../alerts'
import {
  ALERTS_REFRESH_MS, api, ApiError, busRouteIds, getAlerts, getRoutes, isSubwayRoute, ROUTES, stationRouteIds, towardLabel,
  type Alert, type Prediction, type Route, type Station,
} from '../api'
import { AccessibleIcon, AlertBanner, Card, LineBadge, LoadingText, NotFound, secondaryButton, Status } from '../components'
import { agoLabel, clock, countdown, groupDepartures, noTrainsMessage, secondsAgo, STALE_AFTER_SECONDS } from '../time'
import { failure, useNow, usePolling, useTitle } from '../usePolling'

const REFRESH_MS = 10_000

export default function StationPage() {
  const { stopId = '' } = useParams()
  const now = useNow()
  const routes = usePolling(getRoutes, ROUTES)
  const stationPath = `/stations/${encodeURIComponent(stopId)}`
  const station = usePolling(() => api<Station>(stationPath), stationPath)
  // Its buses too: a station's bus routes, or everything at a bus stop.
  const predictionsPath = `${stationPath}/predictions?bus=true`
  const predictions = usePolling(() => api<Prediction[]>(predictionsPath), predictionsPath, REFRESH_MS)

  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS)
  // Bus alerts only come per route (too many to load them all): this stop's routes.
  const busIds = station.data ? busRouteIds(station.data) : []
  const busAlertsPath = `/alerts?routes=${encodeURIComponent(busIds.join(','))}`
  const busAlerts = usePolling(() => (busIds.length ? api<Alert[]>(busAlertsPath) : Promise.resolve([])), busAlertsPath, ALERTS_REFRESH_MS)
  const busOnly = station.data?.routeId === ''
  // Elevator and escalator outages (MBTA leaves them out of the usual alerts). A bus stop has none.
  const accessPath = `${stationPath}/access`
  const access = usePolling(() => (station.data?.routeId ? api<Alert[]>(accessPath) : Promise.resolve<Alert[]>([])), `${accessPath}|${!!station.data?.routeId}`, ALERTS_REFRESH_MS)
  const notFound = station.error instanceof ApiError && station.error.status === 404
  useTitle(notFound ? 'Stop not found' : station.data?.name)

  const groups = predictions.data ? groupDepartures(predictions.data, now) : []
  // Trains and buses under their own headings at a station that has both.
  const trainGroups = groups.filter((g) => isSubwayRoute(g.routeId))
  const busGroups = groups.filter((g) => !isSubwayRoute(g.routeId))
  const headings = trainGroups.length > 0 && busGroups.length > 0
  const age = predictions.updatedAt && secondsAgo(predictions.updatedAt, now)
  const stationAlerts =
    station.data && alerts.data
      ? alertsFor([...alerts.data, ...(busAlerts.data ?? [])], {
          routeIds: [...stationRouteIds(station.data), ...busIds],
          stopId: station.data.mbtaStopId,
        })
      : []

  if (notFound) {
    return <NotFound title="Stop not found" message="There's no station or bus stop at this address." back={{ to: '/lines', label: 'Browse lines' }} />
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{station.data?.name ?? <LoadingText className="h-7 w-48" />}</h1>
        <div className="mt-1 flex flex-wrap gap-1">
          {station.data &&
            [...stationRouteIds(station.data), ...busIds].map((id) => <LineBadge key={id} routeId={id} routes={routes.data} />)}
        </div>
        {/* Each side of the street is its own bus stop: say which way this one's buses go. */}
        {station.data && busOnly && (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Bus stop · {towardLabel(station.data, routes.data, 4)}</p>
        )}
        {/* Wheelchair users need to know before they go; elevator and escalator outages are listed below. */}
        {station.data?.isAccessible != null && (
          <p className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${station.data.isAccessible ? 'text-blue-700 dark:text-blue-300' : 'text-neutral-500'}`}>
            <AccessibleIcon className="size-5" />
            {station.data.isAccessible ? 'Wheelchair accessible' : 'Not wheelchair accessible'}
          </p>
        )}
        {/* Stations only: a bus stop is at street level, so its (empty) list says nothing. */}
        {station.data?.routeId && station.data.isAccessible && access.data?.length === 0 && (
          <p className="mt-0.5 pl-6.5 text-sm text-neutral-500">No elevator or escalator outages reported</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Apple Maps walking directions from where you are (opens the Maps app on iPhone). */}
        {station.data && (
          <a
            href={`https://maps.apple.com/?daddr=${station.data.latitude},${station.data.longitude}&dirflg=w`}
            target="_blank"
            rel="noreferrer"
            className={secondaryButton}
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
              <path d="M21 3 3 10.5l7.5 2.9L13.5 21z" />
            </svg>
            Directions<span className="sr-only"> to {station.data.name} (opens Apple Maps)</span>
          </a>
        )}
        <Link to={`/commutes/new?station=${encodeURIComponent(stopId)}`} className={secondaryButton}>
          <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add commute
        </Link>
      </div>

      {stationAlerts.map((alert) => (
        <AlertBanner key={alert.id} alert={alert} />
      ))}

      {!!access.data?.length && (
        <section className="space-y-2">
          <h2 className="px-1 text-lg font-bold">Elevators & escalators</h2>
          {access.data.map((alert) => (
            <AlertBanner key={alert.id} alert={alert} />
          ))}
        </section>
      )}

      <Status error={failure(station) ?? failure(predictions)} loading={!predictions.data && !predictions.error} />

      {predictions.data && groups.length === 0 && (
        <Card>
          <p className="text-neutral-500">
            {busOnly
              ? "No buses are predicted here right now. Some routes don't run late at night or on weekends."
              : noTrainsMessage(!!majorAlert(stationAlerts), now)}
          </p>
        </Card>
      )}

      {headings && <h2 className="px-1 text-lg font-bold">Trains</h2>}
      <Departures groups={trainGroups} routes={routes.data} now={now} />
      {headings && <h2 className="px-1 text-lg font-bold">Buses</h2>}
      <Departures groups={busGroups} routes={routes.data} now={now} />

      {age !== undefined &&
        (age > STALE_AFTER_SECONDS ? (
          // The countdowns keep ticking from old predictions; say so rather than let them look live.
          <p role="status" className="text-center text-sm font-semibold text-amber-700 dark:text-amber-400">
            Times may be out of date. Last updated {agoLabel(age)}.
          </p>
        ) : (
          <p className="text-center text-xs text-neutral-500">Live from MBTA, updated {agoLabel(age)}</p>
        ))}
    </>
  )
}

function Departures({ groups, routes, now }: { groups: ReturnType<typeof groupDepartures>; routes: Route[] | undefined; now: Date }) {
  return (
    <ul className="space-y-3">
      {groups.map((g) => {
        const route = routes?.find((r) => r.id === g.routeId)
        const destination = route?.directionDestinations[g.directionId] ?? `Direction ${g.directionId}`
        return (
          <li key={`${g.routeId}|${g.directionId}`}>
            <Card>
              {/* Next one big on the right, the ones after it underneath: readable at a glance. */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <LineBadge routeId={g.routeId} routes={routes} />
                    <span className="truncate font-semibold">to {destination}</span>
                  </div>
                  {g.departures.length > 1 && (
                    <p className="mt-1 text-sm text-neutral-500">
                      Then {g.departures.slice(1).map((time) => countdown(time, now)).join(', ')}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-bold tabular-nums">{countdown(g.departures[0], now)}</div>
                  <div className="text-xs text-neutral-500">{clock(g.departures[0])}</div>
                </div>
              </div>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
