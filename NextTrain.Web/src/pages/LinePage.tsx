import { Link, useParams, useSearchParams } from 'react-router'
import { api, getRoutes, stationRouteIds, type Route, type Station } from '../api'
import { Card, LineBadge, Status } from '../components'
import { usePolling } from '../usePolling'

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
  const route = routes.data?.find((r) => r.id === routeId)
  const color = route?.color ?? 'var(--color-mbta-silver)'

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <span className="h-7 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {route?.name ?? routeId}
      </h1>

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
        // Route strip: a colored line with a stop marker per station, like MBTA line maps.
        <Card>
          <ol>
            {stations.data.map((station, i) => (
              <li key={station.mbtaStopId} className="relative flex items-stretch gap-3">
                <span className="relative w-5 shrink-0">
                  <span
                    className="absolute inset-x-1.5 w-2"
                    style={{ backgroundColor: color, top: i === 0 ? '50%' : 0, bottom: i === stations.data!.length - 1 ? '50%' : 0 }}
                  />
                  <span className="absolute top-1/2 left-0 size-5 -translate-y-1/2 rounded-full border-4 bg-white dark:bg-neutral-900" style={{ borderColor: color }} />
                </span>
                <StationLink station={station} routes={routes.data} currentRoute={routeId} />
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
                  {sort === 'ridership' && <span className="w-6 text-right text-sm font-bold text-neutral-400 tabular-nums">{i + 1}</span>}
                  <StationLink station={station} routes={routes.data} currentRoute={routeId} showRidership={sort === 'ridership'} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {sort === 'ridership' && (
        <p className="text-center text-xs text-neutral-500">
          Average weekday boardings at the station (all lines), MBTA Fall 2024 counts.
        </p>
      )}
    </>
  )
}

function StationLink({ station, routes, currentRoute, showRidership }: {
  station: Station
  routes: Route[] | undefined
  currentRoute: string
  showRidership?: boolean
}) {
  const transfers = stationRouteIds(station).filter((id) => id !== currentRoute)
  // Several Green branches read better as one "GL" badge.
  const greens = transfers.filter((id) => id.startsWith('Green-'))
  const badges = greens.length > 1
    ? [...transfers.filter((id) => !id.startsWith('Green-')), greens[0]]
    : transfers
  return (
    <Link to={`/stations/${station.mbtaStopId}`} className="flex min-h-11 flex-1 items-center justify-between gap-2 py-1 hover:underline">
      <span>
        <span className="font-medium">{station.name}</span>
        {showRidership && (
          <span className="block text-sm text-neutral-500">
            {station.averageWeekdayBoardings === null ? 'No data' : `${station.averageWeekdayBoardings.toLocaleString()} weekday boardings`}
          </span>
        )}
      </span>
      <span className="flex flex-wrap justify-end gap-1">
        {badges.map((id) => (
          <LineBadge key={id} routeId={id} routes={routes} label={greens.length > 1 && id === greens[0] ? 'GL' : undefined} />
        ))}
      </span>
    </Link>
  )
}
