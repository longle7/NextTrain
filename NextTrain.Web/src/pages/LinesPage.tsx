import { getRoutes } from '../api'
import { Card, LineBadge, Status } from '../components'
import { usePolling } from '../usePolling'

export default function LinesPage() {
  const routes = usePolling(getRoutes, 'routes')

  return (
    <>
      <h1 className="text-2xl font-bold">Subway lines</h1>
      <Status error={routes.error} loading={!routes.data} />
      <ul className="space-y-2">
        {routes.data?.map((route) => (
          <li key={route.id}>
            <Card to={`/lines/${route.id}`}>
              <div className="flex items-center gap-3">
                <span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: route.color }} />
                <div className="flex-1">
                  <div className="font-semibold">{route.name}</div>
                  <div className="text-sm text-neutral-500">{route.directionDestinations.join(' - ')}</div>
                </div>
                <LineBadge routeId={route.id} routes={routes.data} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
