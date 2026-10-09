import { useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import {
  api, ApiError, busDirections, busRouteIds, findRoute, getBusStops, getRoutes, getStations, ROUTES, searchStations,
  stationRouteIds, towardLabel,
  type Commute, type CommuteInput, type Route, type Station,
} from '../api'
import { WEEK } from '../commutes'
import { recentStationIds } from '../recent'
import { Card, dangerButton, LineBadge, linkButton, NotFound, primaryButton, SearchInput, Status } from '../components'
import { usePolling, useTitle } from '../usePolling'

// /commutes/new (optionally ?station=place-pktrm) and /commutes/:id
export default function CommutePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const existing = usePolling(() => (id ? api<Commute>(`/commutes/${id}`) : Promise.resolve(undefined)), id ?? 'new', undefined, {
    remember: false, // the form must start from the saved commute, never an older copy
  })
  // Someone else's commute also answers 404 (see CommutesController), so this covers both.
  const notFound = existing.error instanceof ApiError && existing.error.status === 404
  useTitle(notFound ? 'Commute not found' : id ? 'Edit commute' : 'New commute')

  if (notFound) return <NotFound title="Commute not found" message="This commute doesn't exist on this device. It may have been deleted." />
  if (id && !existing.data) return <Status error={existing.error} loading={!existing.error} />
  return <CommuteForm key={id ?? 'new'} existing={existing.data} initialStopId={params.get('station') ?? ''} />
}

function CommuteForm({ existing, initialStopId }: { existing: Commute | undefined; initialStopId: string }) {
  const navigate = useNavigate()
  const routes = usePolling(getRoutes, ROUTES)
  const stations = usePolling(getStations, 'stations')
  const busStops = usePolling(getBusStops, '/bus-stops', undefined, { remember: false }) // ~1 MB: the browser caches it
  // Stations first, so a search for "Harvard" offers the station before the bus stops near it.
  const allStops = stations.data && busStops.data ? [...stations.data, ...busStops.data] : stations.data

  const [stopId, setStopId] = useState(existing?.mbtaStopId ?? initialStopId)
  const [routeId, setRouteId] = useState(existing?.routeId ?? '')
  const [directionId, setDirectionId] = useState(existing?.directionId)
  const [start, setStart] = useState(() => existing?.windowStart.slice(0, 5) ?? suggestedWindow()[0])
  const [end, setEnd] = useState(() => existing?.windowEnd.slice(0, 5) ?? suggestedWindow()[1])
  const [days, setDays] = useState(existing?.activeDays.split(',') ?? WEEK.slice(0, 5))
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const station = allStops?.find((s) => s.mbtaStopId === stopId)
  const stationRoutes = station ? [...stationRouteIds(station), ...busRouteIds(station)] : []
  // A single-line station needs no choice.
  const chosenRouteId = stationRoutes.includes(routeId) ? routeId : stationRoutes.length === 1 ? stationRoutes[0] : undefined
  const route = findRoute(routes.data, chosenRouteId ?? '')
  // A train goes both ways from a station; a bus usually just one way from a stop (each side of the street is its own
  // stop), and then there's no choice to make.
  const directions = route?.type === 'bus' && station ? busDirections(station, route.id) : [0, 1]
  const chosenDirection =
    directionId !== undefined && directions.includes(directionId) ? directionId : directions.length === 1 ? directions[0] : undefined
  const ready = station && chosenRouteId && chosenDirection !== undefined && start < end && days.length > 0

  const pickStation = (id: string) => {
    setStopId(id)
    setRouteId('')
    setDirectionId(undefined)
  }

  const save = async () => {
    if (!ready) return
    const body: CommuteInput = {
      mbtaStopId: station.mbtaStopId, routeId: chosenRouteId, directionId: chosenDirection,
      windowStart: start, windowEnd: end, activeDays: days.join(','),
    }
    await submit(() => api(existing ? `/commutes/${existing.id}` : '/commutes', { method: existing ? 'PUT' : 'POST', body: JSON.stringify(body) }))
  }

  const remove = async () => {
    if (existing && confirm('Delete this commute?')) await submit(() => api(`/commutes/${existing.id}`, { method: 'DELETE' }))
  }

  const submit = async (request: () => Promise<unknown>) => {
    setSaving(true)
    setError(undefined)
    try {
      await request()
      navigate('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{existing ? 'Edit commute' : 'New commute'}</h1>
      <Status error={stations.error ?? routes.error} />

      <Step title="Where do you get on?">
        {station ? (
          <Card>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{station.name}</span>
              <button onClick={() => pickStation('')} className={linkButton}>
                Change<span className="sr-only"> station</span>
              </button>
            </div>
          </Card>
        ) : (
          <StationPicker stations={allStops} routes={routes.data} onPick={pickStation} />
        )}
      </Step>

      {station && stationRoutes.length > 1 && (
        <Step title="Which line?">
          <div className="flex flex-wrap gap-2">
            {stationRoutes.map((id) => (
              <Choice key={id} selected={chosenRouteId === id} onClick={() => {
                  setRouteId(id)
                  setDirectionId(undefined)
                }}>
                {/* The name is written out next to it, so screen readers skip the badge rather than say it twice. */}
                <span aria-hidden>
                  <LineBadge routeId={id} routes={routes.data} />
                </span>
                <span className="text-left">{routes.data?.find((r) => r.id === id)?.name ?? id}</span>
              </Choice>
            ))}
          </div>
        </Step>
      )}

      {route && (
        <Step title="Which way?">
          <div className="grid grid-cols-2 gap-2">
            {route.directionDestinations.map((destination, i) => directions.includes(i) && (
              <Choice key={i} selected={chosenDirection === i} onClick={() => setDirectionId(i)}>
                <span className="text-left">
                  <span className="block">{destination}</span>
                  <span className="block text-xs font-normal text-neutral-500">{bound(route, i)}</span>
                </span>
              </Choice>
            ))}
          </div>
        </Step>
      )}

      <Step title="When do you usually leave?">
        <Card>
          <div className="flex items-center gap-2">
            <TimeInput label="From" value={start} onChange={setStart} />
            <span className="text-neutral-500">to</span>
            <TimeInput label="To" value={end} onChange={setEnd} />
          </div>
          {start >= end && <p className="mt-2 text-sm text-red-700 dark:text-red-300">The end time needs to be after the start.</p>}
          <div className="mt-4 grid grid-cols-7 gap-1" role="group" aria-label="Days">
            {WEEK.map((day) => {
              const on = days.includes(day)
              return (
                <button
                  key={day}
                  aria-label={DAY_NAMES[day]} // "Monday", not "Mon" (still contains the visible text)
                  aria-pressed={on}
                  onClick={() => setDays(on ? days.filter((d) => d !== day) : WEEK.filter((d) => d === day || days.includes(d)))}
                  className={`min-h-11 rounded-lg text-sm font-semibold ${on ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'}`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </Card>
      </Step>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">{error}</p>}

      <button
        onClick={save}
        disabled={!ready || saving}
        className={`${primaryButton} text-lg`}
      >
        {saving ? 'Saving…' : existing ? 'Save changes' : 'Save commute'}
      </button>
      {existing && (
        <button onClick={remove} disabled={saving} className={dangerButton}>
          Delete commute
        </button>
      )}
    </>
  )
}

function StationPicker({ stations, routes, onPick }: { stations: Station[] | undefined; routes: Route[] | undefined; onPick: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [recentIds] = useState(recentStationIds)
  // Before typing, offer the stations you looked at last: often the one you're about to save.
  const recent = recentIds.flatMap((id) => stations?.find((s) => s.mbtaStopId === id) ?? [])
  const results = stations ? (query.trim() ? searchStations(stations, query, 6) : recent) : []
  return (
    <div className="space-y-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Search stations or bus stops" onSubmit={() => results[0] && onPick(results[0].mbtaStopId)} />
      {!query.trim() && results.length > 0 && <p className="px-1 text-sm font-semibold text-neutral-500">Recent</p>}
      {results.map((s) => (
        <button key={s.mbtaStopId} onClick={() => onPick(s.mbtaStopId)} className="w-full text-left">
          <Card>
            <span className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{s.name}</span>
                {/* Both sides of a street have a stop with the same name: this says which one. */}
                {!s.routeId && <span className="block text-sm text-neutral-500">{towardLabel(s, routes)}</span>}
              </span>
              <span className="flex max-w-[45%] shrink-0 flex-wrap justify-end gap-1">
                {[...stationRouteIds(s), ...busRouteIds(s)].slice(0, 4).map((id) => (
                  <LineBadge key={id} routeId={id} routes={routes} />
                ))}
              </span>
            </span>
          </Card>
        </button>
      ))}
    </div>
  )
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-12 items-center gap-2 rounded-xl bg-white px-3 py-2 font-semibold shadow-sm ring-2 dark:bg-neutral-900 ${selected ? 'ring-neutral-900 dark:ring-white' : 'ring-transparent'}`}
    >
      {children}
    </button>
  )
}

const DAY_NAMES: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
}

// iOS shows its native time wheel for type="time".
function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 min-w-0 flex-1 rounded-lg bg-neutral-100 px-3 text-base font-semibold dark:bg-neutral-800"
    />
  )
}

// Suggest a morning trip before noon and an evening one after.
const suggestedWindow = () => (new Date().getHours() < 12 ? ['08:00', '09:00'] : ['17:00', '18:00'])

// "Northbound" from MBTA's "North"; names that aren't compass points (e.g. Mattapan's "Inbound") are used as-is.
const bound = (route: Route, directionId: number) => {
  const name = route.directionNames[directionId] ?? ''
  return ['North', 'South', 'East', 'West'].includes(name) ? `${name}bound` : name
}
