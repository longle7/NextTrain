import { useParams } from 'react-router'
import { api, getRoutes, stationRouteIds, type Station } from '../api'
import { Card, LineBadge, Status } from '../components'
import { usePolling } from '../usePolling'

export default function LinePage() {
  const { routeId = '' } = useParams()
  const routes = usePolling(getRoutes, 'routes')
  const stations = usePolling(() => api<Station[]>(`/stations?route=${encodeURIComponent(routeId)}`), routeId)
  const route = routes.data?.find((r) => r.id === routeId)

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <span className="h-7 w-1.5 rounded-full bg-mbta-silver" style={route && { backgroundColor: route.color }} />
        {route?.name ?? routeId}
      </h1>
      <Status error={stations.error} loading={!stations.data} />
      {stations.data?.length === 0 && <p className="text-neutral-500">No stations imported for this line yet.</p>}
      <ul className="space-y-2">
        {stations.data?.map((station) => (
          <li key={station.mbtaStopId}>
            <Card to={`/stations/${station.mbtaStopId}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{station.name}</span>
                <span className="flex flex-wrap justify-end gap-1">
                  {stationRouteIds(station).map((id) => (
                    <LineBadge key={id} routeId={id} routes={routes.data} />
                  ))}
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
