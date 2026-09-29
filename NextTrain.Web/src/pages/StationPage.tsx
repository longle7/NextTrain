import { useParams } from 'react-router'
import { api, getRoutes, stationRouteIds, type Prediction, type Station } from '../api'
import { Card, LineBadge, Status } from '../components'
import { countdown, groupDepartures, secondsAgo } from '../time'
import { useNow, usePolling } from '../usePolling'

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

  const groups = predictions.data ? groupDepartures(predictions.data, now) : []

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{station.data?.name ?? 'Station'}</h1>
        <div className="mt-1 flex flex-wrap gap-1">
          {station.data &&
            stationRouteIds(station.data).map((id) => <LineBadge key={id} routeId={id} routes={routes.data} />)}
        </div>
      </div>

      <Status error={station.error ?? predictions.error} loading={!predictions.data && !predictions.error} />

      {predictions.data && groups.length === 0 && (
        <Card>
          <p className="text-neutral-500">No upcoming trains right now. The subway runs about 5 AM to 1 AM.</p>
        </Card>
      )}

      <ul className="space-y-3">
        {groups.map((g) => {
          const route = routes.data?.find((r) => r.id === g.routeId)
          const destination = route?.directionDestinations[g.directionId] ?? `Direction ${g.directionId}`
          return (
            <li key={`${g.routeId}|${g.directionId}`}>
              <Card>
                <div className="flex items-center gap-2">
                  <LineBadge routeId={g.routeId} routes={routes.data} />
                  <span className="font-semibold">to {destination}</span>
                </div>
                <ol className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
                  {g.departures.map((time) => (
                    <li key={time} className="flex justify-between py-2">
                      <span className="text-neutral-500">
                        {new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className="font-bold tabular-nums">{countdown(time, now)}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </li>
          )
        })}
      </ul>

      {predictions.updatedAt && (
        <p className="text-center text-xs text-neutral-500">
          Live from MBTA, updated {secondsAgo(predictions.updatedAt, now)}s ago
        </p>
      )}
    </>
  )
}
