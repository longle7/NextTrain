import { useParams, useSearchParams } from 'react-router'
import { alertsFor } from '../alerts'
import { ALERTS_REFRESH_MS, api, getAlerts, getRoutes, type Station, type Vehicle } from '../api'
import { AlertBanner, Card, LoadingText, NotFound, Status, StationLink } from '../components'
import { directionsDown, trainsByStation, type LineTrain } from '../lineTrains'
import { usePolling, useTitle } from '../usePolling'

const SORTS = [
  { id: 'line', label: 'Line order' },
  { id: 'name', label: 'A-Z' },
  { id: 'ridership', label: 'Ridership' },
] as const

type Sort = (typeof SORTS)[number]['id']

export default function LinePage() {
  const { routeId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const sort: Sort = SORTS.find((s) => s.id === params.get('sort'))?.id ?? 'line'

  const routes = usePolling(getRoutes, 'routes')
  const stations = usePolling(
    () => api<Station[]>(`/stations?route=${encodeURIComponent(routeId)}&sort=${sort}`),
    `${routeId}|${sort}`,
  )
  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS)
  // Live trains only show on the line-order strip, so only poll for them there.
  const lineOrder = sort === 'line'
  const vehicles = usePolling(
    () => (lineOrder ? api<Vehicle[]>('/vehicles') : Promise.resolve<Vehicle[]>([])),
    `vehicles|${lineOrder}`,
    lineOrder ? 10_000 : undefined,
  )
  const route = routes.data?.find((r) => r.id === routeId)
  const notFound = !!routes.data && !route // e.g. /lines/Purple: no such subway line
  const color = route?.color ?? 'var(--color-mbta-silver)'
  useTitle(notFound ? 'Line not found' : (route?.name ?? routeId))
  const trains = lineOrder && route && stations.data && vehicles.data ? trainsByStation(vehicles.data, route, stations.data) : undefined
  const trainsAt = (station: Station, down: boolean) => trains?.get(station.mbtaStopId)?.filter((t) => t.down === down) ?? []
  // For the caption: which direction (by ID) runs down the list, i.e. on the left.
  const sides = lineOrder && route && stations.data?.length ? directionsDown(stations.data, route.directionDestinations) : undefined

  if (notFound) {
    return <NotFound title="Line not found" message="There's no subway line at this address." back={{ to: '/lines', label: 'All lines' }} />
  }

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <span className="h-7 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {route?.name ?? <LoadingText className="h-7 w-36" />}
      </h1>

      {alerts.data &&
        alertsFor(alerts.data, { routeIds: [routeId] }).map((alert) => <AlertBanner key={alert.id} alert={alert} />)}

      <div role="radiogroup" aria-label="Sort stations" className="grid grid-cols-3 rounded-lg bg-neutral-200 p-1 text-sm font-semibold dark:bg-neutral-800">
        {SORTS.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={sort === s.id}
            onClick={() => setParams(s.id === 'line' ? {} : { sort: s.id }, { replace: true })}
            className={`rounded-md py-1.5 ${sort === s.id ? 'bg-white shadow-sm dark:bg-neutral-950' : 'text-neutral-500'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Status error={stations.error} loading={!stations.data} />
      {stations.data?.length === 0 && <p className="text-neutral-500">No stations imported for this line yet.</p>}

      {sort === 'line' && stations.data && stations.data.length > 0 ? (
        // Route strip: a colored line with a stop marker per station, like MBTA line maps, and live trains
        // beside it: trains moving down the list on the left, up the list on the right.
        <Card>
          <ol>
            {stations.data.map((station, i) => (
              <li key={station.mbtaStopId} className="relative flex items-stretch gap-2">
                <TrainColumn trains={trainsAt(station, true)} color={color} />
                <span className="relative w-5 shrink-0">
                  <span
                    className="absolute inset-x-1.5 w-2"
                    style={{ backgroundColor: color, top: i === 0 ? '50%' : 0, bottom: i === stations.data!.length - 1 ? '50%' : 0 }}
                  />
                  <span className="absolute top-1/2 left-0 size-5 -translate-y-1/2 rounded-full border-4 bg-white dark:bg-neutral-900" style={{ borderColor: color }} />
                </span>
                <TrainColumn trains={trainsAt(station, false)} color={color} />
                <StationLink station={station} routes={routes.data} hideRoute={routeId} />
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <ul className="space-y-2">
          {stations.data?.map((station, i) => (
            <li key={station.mbtaStopId}>
              <Card>
                <div className="flex items-center gap-3">
                  {sort === 'ridership' && <span className="w-6 text-right text-sm font-bold text-neutral-500 tabular-nums">{i + 1}</span>}
                  <StationLink
                    station={station}
                    routes={routes.data}
                    hideRoute={routeId}
                    detail={sort === 'ridership' && ridershipLabel(station)}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {sides && route && (
        <p className="text-center text-xs text-neutral-500">
          Live trains, updated every 10 seconds: left side to {route.directionDestinations[sides.indexOf(true)]}, right side
          to {route.directionDestinations[sides.indexOf(false)]}.
        </p>
      )}

      {sort === 'ridership' && (
        <p className="text-center text-xs text-neutral-500">
          Average weekday boardings at the station (all lines), MBTA Fall 2024 counts.
        </p>
      )}
    </>
  )
}

const ridershipLabel = (station: Station) =>
  station.averageWeekdayBoardings === null ? 'No data' : `${station.averageWeekdayBoardings.toLocaleString()} weekday boardings`

// Stopped trains sit level with their station; approaching ones at the edge they're coming from.
function TrainColumn({ trains, color }: { trains: LineTrain[]; color: string }) {
  return (
    <span className="relative w-5 shrink-0">
      {trains.map((t) => (
        <span
          key={t.id}
          role="img"
          aria-label={t.label}
          title={t.label}
          className="absolute left-0 z-10 size-5 -translate-y-1/2"
          style={{ top: t.atStation ? '50%' : t.down ? '0%' : '100%' }}
        >
          <svg viewBox="0 0 24 24" className={`size-5 ${t.down ? 'rotate-180' : ''}`} aria-hidden>
            <circle cx="12" cy="12" r="10.5" style={{ fill: color }} stroke="white" strokeWidth="2" />
            <path d="M12 6.5 16.5 14h-9z" fill="white" />
          </svg>
        </span>
      ))}
    </span>
  )
}
