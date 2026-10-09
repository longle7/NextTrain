import { Link, useParams, useSearchParams } from 'react-router'
import { alertsFor } from '../alerts'
import { ALERTS_REFRESH_MS, api, findRoute, getAlerts, getRoutes, isSubwayRoute, ROUTES, type Alert, type Station, type Vehicle } from '../api'
import { AlertBanner, Card, LineBadge, LoadingText, NotFound, secondaryButton, Status, StationLink } from '../components'
import { directionsDown, trainsByStation, type LineTrain } from '../lineTrains'
import { failure, usePolling, useTitle } from '../usePolling'

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

  const routes = usePolling(getRoutes, ROUTES)
  const route = findRoute(routes.data, routeId)
  // Known before routes load (bus route IDs are numbers or MBTA's, like "741"), so the right data is fetched at once.
  const bus = route ? route.type === 'bus' : !isSubwayRoute(routeId)
  // A bus route's two directions mostly use different stops (each side of the street), so it shows one way at a time.
  const direction = params.get('dir') === '1' ? 1 : 0
  const id = encodeURIComponent(routeId)
  const stationsPath = bus ? `/stations?route=${id}&direction=${direction}&sort=line` : `/stations?route=${id}&sort=${sort}`
  const stations = usePolling(() => api<Station[]>(stationsPath), stationsPath)
  // Bus alerts only come per route; the subway's are one shared list.
  const alertsPath = bus ? `/alerts?routes=${id}` : 'alerts'
  const alerts = usePolling(bus ? () => api<Alert[]>(alertsPath) : getAlerts, alertsPath, ALERTS_REFRESH_MS)
  // Live trains only show on the line-order strip, so only poll for them there.
  const lineOrder = bus || sort === 'line'
  const vehiclesPath = bus ? `/vehicles?route=${id}` : '/vehicles'
  const vehicles = usePolling(
    () => (lineOrder ? api<Vehicle[]>(vehiclesPath) : Promise.resolve<Vehicle[]>([])),
    `${vehiclesPath}|${lineOrder}`,
    lineOrder ? 10_000 : undefined,
    { remember: false }, // old train positions mislead
  )
  const notFound = !!routes.data && !route // e.g. /lines/Purple: no such line or route
  const color = route?.color ?? 'var(--color-mbta-silver)'
  const ink = route?.textColor ?? '#FFFFFF' // readable on `color`: black on bus yellow
  // Bus yellow is too pale against a white card on its own; a thin dark edge keeps the strip visible.
  const edge = route?.textColor === '#000000' ? 'inset 0 0 0 1px rgb(0 0 0 / 0.3)' : undefined
  const name = route && (bus ? `Route ${route.shortName || route.id}` : route.name)
  useTitle(notFound ? 'Line not found' : (name ?? routeId))
  const trains =
    lineOrder && route && stations.data && vehicles.data
      ? trainsByStation(vehicles.data, route, stations.data, bus ? direction : undefined)
      : undefined
  const trainsAt = (station: Station, down: boolean) => trains?.get(station.mbtaStopId)?.filter((t) => t.down === down) ?? []
  // For the caption: which direction (by ID) runs down the list, i.e. on the left.
  const sides = !bus && lineOrder && route && stations.data?.length ? directionsDown(stations.data, route.directionDestinations) : undefined

  if (notFound) {
    return <NotFound title="Line not found" message="There's no subway line or bus route at this address." back={{ to: '/lines', label: 'All lines' }} />
  }

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        {bus ? (
          // The heading says "Route 1" already; the badge is just its color.
          route && (
            <span aria-hidden>
              <LineBadge routeId={route.id} routes={routes.data} />
            </span>
          )
        ) : (
          <span className="h-7 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        )}
        {name ?? <LoadingText className="h-7 w-36" />}
      </h1>
      {bus && route && <p className="-mt-2 text-neutral-600 dark:text-neutral-300">{route.name}</p>}

      {alerts.data &&
        alertsFor(alerts.data, { routeIds: [routeId] }).map((alert) => <AlertBanner key={alert.id} alert={alert} />)}

      {bus && route && (
        <>
          <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 rounded-lg bg-neutral-200 p-1 text-sm font-semibold dark:bg-neutral-800">
            {route.directionDestinations.map((destination, d) => (
              <button
                key={d}
                role="radio"
                aria-checked={direction === d}
                onClick={() => setParams(d === 1 ? { dir: '1' } : {}, { replace: true })}
                className={`truncate rounded-md px-2 py-1.5 ${direction === d ? 'bg-white shadow-sm dark:bg-neutral-950' : 'text-neutral-500'}`}
              >
                To {destination}
              </button>
            ))}
          </div>
          <Link to={`/map?line=bus&route=${id}`} className={secondaryButton}>
            View on map
          </Link>
        </>
      )}

      {!bus && (
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
      )}

      <Status error={failure(stations)} loading={!stations.data} />
      {stations.data?.length === 0 && <p className="text-neutral-500">No stops imported for this {bus ? 'route' : 'line'} yet.</p>}

      {lineOrder && stations.data && stations.data.length > 0 ? (
        // Route strip: a colored line with a stop marker per station, like MBTA line maps, and live trains
        // beside it: trains moving down the list on the left, up the list on the right.
        <Card>
          <ol>
            {stations.data.map((station, i) => (
              <li key={station.mbtaStopId} className="relative flex items-stretch gap-2">
                <TrainColumn trains={trainsAt(station, true)} color={color} ink={ink} />
                <span className="relative w-5 shrink-0">
                  <span
                    className="absolute inset-x-1.5 w-2"
                    style={{ backgroundColor: color, boxShadow: edge, top: i === 0 ? '50%' : 0, bottom: i === stations.data!.length - 1 ? '50%' : 0 }}
                  />
                  <span
                    className="absolute top-1/2 left-0 size-5 -translate-y-1/2 rounded-full border-4 bg-white dark:bg-neutral-900"
                    style={{ borderColor: color, boxShadow: edge }}
                  />
                </span>
                <TrainColumn trains={trainsAt(station, false)} color={color} ink={ink} />
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

      {bus && route && (
        <p className="text-center text-xs text-neutral-500">
          Live buses to {route.directionDestinations[direction]}, updated every 10 seconds.
        </p>
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

// Stopped trains sit level with their station; approaching ones at the edge they're coming from. `ink` is readable on
// `color` (the route's text color): white on the subway's colors, black on bus yellow.
function TrainColumn({ trains, color, ink }: { trains: LineTrain[]; color: string; ink: string }) {
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
            <circle cx="12" cy="12" r="10.5" style={{ fill: color }} stroke={ink} strokeWidth="2" />
            <path d="M12 6.5 16.5 14h-9z" fill={ink} />
          </svg>
        </span>
      ))}
    </span>
  )
}
