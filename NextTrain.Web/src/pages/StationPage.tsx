import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { alertsFor, majorAlert } from '../alerts'
import { ALERTS_REFRESH_MS, api, getAlerts, getRoutes, stationRouteIds, type Prediction, type Station } from '../api'
import { AlertBanner, Card, LineBadge, secondaryButton, Status } from '../components'
import { rememberStation } from '../recent'
import { agoLabel, clock, countdown, groupDepartures, noTrainsMessage, secondsAgo, STALE_AFTER_SECONDS } from '../time'
import { useNow, usePolling, useTitle } from '../usePolling'

const REFRESH_MS = 10_000

export default function StationPage() {
  const { stopId = '' } = useParams()
  const now = useNow()
  const routes = usePolling(getRoutes, 'routes')
  const station = usePolling(() => api<Station>(`/stations/${encodeURIComponent(stopId)}`), stopId)
  const predictions = usePolling(
    () => api<Prediction[]>(`/stations/${encodeURIComponent(stopId)}/predictions`),
    stopId,
    REFRESH_MS,
  )

  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS)
  useTitle(station.data?.name)
  useEffect(() => {
    if (station.data) rememberStation(station.data.mbtaStopId)
  }, [station.data])

  const groups = predictions.data ? groupDepartures(predictions.data, now) : []
  const age = predictions.updatedAt && secondsAgo(predictions.updatedAt, now)
  const stationAlerts =
    station.data && alerts.data
      ? alertsFor(alerts.data, { routeIds: stationRouteIds(station.data), stopId: station.data.mbtaStopId })
      : []

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{station.data?.name ?? 'Station'}</h1>
        <div className="mt-1 flex flex-wrap gap-1">
          {station.data &&
            stationRouteIds(station.data).map((id) => <LineBadge key={id} routeId={id} routes={routes.data} />)}
        </div>
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
            Directions
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

      <Status error={station.error ?? predictions.error} loading={!predictions.data && !predictions.error} />

      {predictions.data && groups.length === 0 && (
        <Card>
          <p className="text-neutral-500">{noTrainsMessage(!!majorAlert(stationAlerts), now)}</p>
        </Card>
      )}

      <ul className="space-y-3">
        {groups.map((g) => {
          const route = routes.data?.find((r) => r.id === g.routeId)
          const destination = route?.directionDestinations[g.directionId] ?? `Direction ${g.directionId}`
          return (
            <li key={`${g.routeId}|${g.directionId}`}>
              <Card>
                {/* Next train big on the right, the ones after it underneath: readable at a glance. */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <LineBadge routeId={g.routeId} routes={routes.data} />
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
