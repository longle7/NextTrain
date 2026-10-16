import { useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import {
  api, ApiError, busDirections, busRouteIds, findRoute, getBusStops, getRoutes, getStations, ROUTES, routeName, searchStations,
  stationRouteIds, towardLabel,
  type Commute, type CommuteInput, type Route, type Station,
} from '../api'
import { forget } from '../cache'
import { stepNumbers, WEEK } from '../commutes'
import { Card, dangerButton, LineBadge, linkButton, NotFound, primaryButton, SearchInput, secondaryButton, Status } from '../components'
import { usePolling, useTitle } from '../usePolling'

// /commutes/new (optionally ?station=place-pktrm&route=Red, e.g. from the map) and /commutes/:id
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
  return <CommuteForm key={id ?? 'new'} existing={existing.data} initialStopId={params.get('station') ?? ''} initialRouteId={params.get('route') ?? ''} />
}

function CommuteForm({ existing, initialStopId, initialRouteId }: { existing: Commute | undefined; initialStopId: string; initialRouteId: string }) {
  const navigate = useNavigate()
  const routes = usePolling(getRoutes, ROUTES)
  const stations = usePolling(getStations, 'stations')
  const busStops = usePolling(getBusStops, '/bus-stops', undefined, { remember: false }) // ~1 MB: the browser caches it
  // Stations first, so a search for "Harvard" offers the station before the bus stops near it.
  const allStops = stations.data && busStops.data ? [...stations.data, ...busStops.data] : stations.data

  const [stopId, setStopId] = useState(existing?.mbtaStopId ?? initialStopId)
  const [routeId, setRouteId] = useState(existing?.routeId ?? initialRouteId) // used only if the stop serves it
  const [directionId, setDirectionId] = useState(existing?.directionId)
  const [start, setStart] = useState(() => existing?.windowStart.slice(0, 5) ?? suggestedWindow()[0])
  const [end, setEnd] = useState(() => existing?.windowEnd.slice(0, 5) ?? suggestedWindow()[1])
  const [days, setDays] = useState(existing?.activeDays.split(',') ?? WEEK.slice(0, 5))
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  // A change of line partway (e.g. onto the Blue Line at Government Center).
  const [changes, setChanges] = useState(!!existing?.transferStopId)
  const [transferStopId, setTransferStopId] = useState(existing?.transferStopId ?? '')
  const [transferRouteId, setTransferRouteId] = useState(existing?.transferRouteId ?? '')
  const [transferDirectionId, setTransferDirectionId] = useState(existing?.transferDirectionId)
  const [transferMinutes, setTransferMinutes] = useState(existing?.transferMinutes ?? 3)
  // Done tapped: the change shows as a one-line summary. A saved change opens that way.
  const [confirmed, setConfirmed] = useState(!!existing?.transferStopId)

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
  // Where you can change: the first ride's later stops where another line or route stops, in riding order.
  const ridePath = chosenRouteId && chosenDirection !== undefined
    ? `/stations?route=${encodeURIComponent(chosenRouteId)}&direction=${chosenDirection}&sort=line`
    : ''
  const ride = usePolling(() => (changes && ridePath ? api<Station[]>(ridePath) : Promise.resolve<Station[]>([])), `${ridePath}|${changes}`)
  const otherRoutes = (s: Station) => [...stationRouteIds(s), ...busRouteIds(s)].filter((id) => id !== chosenRouteId)
  const nameOf = (id: string) => routeName(id, findRoute(routes.data, id))
  const boardingAt = ride.data?.findIndex((s) => s.mbtaStopId === station?.mbtaStopId) ?? -1
  const changeStations = ride.data && boardingAt >= 0 ? ride.data.slice(boardingAt + 1).filter((s) => otherRoutes(s).length > 0) : []
  const changeStation = changeStations.find((s) => s.mbtaStopId === transferStopId)
  const changeRoutes = changeStation ? otherRoutes(changeStation) : []
  const chosenTransferRoute = changeRoutes.includes(transferRouteId) ? transferRouteId : changeRoutes.length === 1 ? changeRoutes[0] : undefined
  const transferRoute = findRoute(routes.data, chosenTransferRoute ?? '')
  const transferDirections = transferRoute?.type === 'bus' && changeStation ? busDirections(changeStation, transferRoute.id) : [0, 1]
  const chosenTransferDirection = transferDirectionId !== undefined && transferDirections.includes(transferDirectionId)
    ? transferDirectionId
    : transferDirections.length === 1 ? transferDirections[0] : undefined
  const transferDone = !changes || (!!changeStation && !!chosenTransferRoute && chosenTransferDirection !== undefined)
  const ready = station && chosenRouteId && chosenDirection !== undefined && start < end && days.length > 0 && transferDone && (!changes || confirmed)

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
      ...(changes && {
        transferStopId: changeStation!.mbtaStopId, transferRouteId: chosenTransferRoute, transferDirectionId: chosenTransferDirection,
        transferMinutes,
      }),
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
      forget('commutes') // Home's offline copy is out of date now
      navigate('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  // Steps are numbered as shown: "Which line?" and "Which way?" are skipped when there's only one choice.
  const changeShown = !!route && chosenDirection !== undefined
  const [lineStep, wayStep, changeStep, whenStep] = stepNumbers([!!station && stationRoutes.length > 1, !!route, changeShown, true])

  return (
    <>
      <h1 className="text-2xl font-bold">{existing ? 'Edit commute' : 'New commute'}</h1>
      <Status error={stations.error ?? routes.error} />

      <Step n={1} title="Where do you get on?" hint="Search for your station or bus stop.">
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
        <Step n={lineStep} title="Which line?">
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
        <Step n={wayStep} title="Which way?" hint="Pick where you're headed.">
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

      {changeShown && (
        <Step
          n={changeStep}
          title="Do you change trains?"
          hint={changes ? 'Where you get off, and what you catch next.' : 'For example, the Green Line to the Blue Line at Government Center.'}
        >
          {!changes ? (
            <button onClick={() => setChanges(true)} className={secondaryButton}>
              <span aria-hidden>+</span> Add a change
            </button>
          ) : confirmed && changeStation && transferRoute && chosenTransferDirection !== undefined ? (
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    Change at <strong>{changeStation.name}</strong> to
                    <span aria-hidden>
                      <LineBadge routeId={transferRoute.id} routes={routes.data} />
                    </span>
                    <span className="sr-only">{nameOf(transferRoute.id)} toward</span>
                    <strong>{transferRoute.directionDestinations[chosenTransferDirection]}</strong>
                  </p>
                  <p className="text-sm text-neutral-500">{transferMinutes} min to change</p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <button onClick={() => setConfirmed(false)} className={linkButton}>
                    Edit<span className="sr-only"> the change</span>
                  </button>
                  <button onClick={() => setChanges(false)} className={linkButton}>
                    Remove<span className="sr-only"> the change</span>
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-500 uppercase">Where do you change?</h3>
                  {!ride.data ? (
                    <Status loading rows={1} />
                  ) : changeStations.length === 0 ? (
                    <p className="text-sm text-neutral-500">No other lines stop after {station?.name} going this way.</p>
                  ) : changeStation ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{changeStation.name}</span>
                      <button onClick={() => setTransferStopId('')} className={linkButton}>
                        Change<span className="sr-only"> where you change</span>
                      </button>
                    </div>
                  ) : (
                    <ul className="-mx-1 divide-y divide-neutral-100 dark:divide-neutral-800">
                      {changeStations.map((s) => (
                        <li key={s.mbtaStopId}>
                          <button
                            onClick={() => {
                              setTransferStopId(s.mbtaStopId)
                              setTransferRouteId('')
                              setTransferDirectionId(undefined)
                            }}
                            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-1 text-left active:bg-neutral-100 dark:active:bg-neutral-800"
                          >
                            <span className="min-w-0 font-semibold">{s.name}</span>
                            <span aria-hidden className="flex shrink-0 items-center gap-1">
                              {otherRoutes(s).slice(0, 3).map((id) => (
                                <LineBadge key={id} routeId={id} routes={routes.data} />
                              ))}
                              {otherRoutes(s).length > 3 && <span className="text-xs font-semibold text-neutral-500">+{otherRoutes(s).length - 3}</span>}
                            </span>
                            <span className="sr-only">: {otherRoutes(s).map(nameOf).join(', ')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {changeStation && changeRoutes.length > 1 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-neutral-500 uppercase">Onto which line?</h3>
                    <div className="flex flex-wrap gap-2">
                      {changeRoutes.map((id) => (
                        <Choice key={id} selected={chosenTransferRoute === id} onClick={() => {
                            setTransferRouteId(id)
                            setTransferDirectionId(undefined)
                          }}>
                          <span aria-hidden>
                            <LineBadge routeId={id} routes={routes.data} />
                          </span>
                          <span className="text-left">{nameOf(id)}</span>
                        </Choice>
                      ))}
                    </div>
                  </div>
                )}

                {transferRoute && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-neutral-500 uppercase">Which way then?</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {transferRoute.directionDestinations.map((destination, i) => transferDirections.includes(i) && (
                        <Choice key={i} selected={chosenTransferDirection === i} onClick={() => setTransferDirectionId(i)}>
                          <span className="text-left">{destination}</span>
                        </Choice>
                      ))}
                    </div>
                  </div>
                )}

                {transferRoute && chosenTransferDirection !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-neutral-500 uppercase">Time to change</span>
                      <span className="block text-sm text-neutral-500">Platform to platform</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        onClick={() => setTransferMinutes((m) => Math.max(1, m - 1))}
                        disabled={transferMinutes <= 1}
                        aria-label="Less time to change"
                        className="grid size-11 place-items-center rounded-full bg-neutral-100 text-xl font-bold disabled:opacity-40 dark:bg-neutral-800"
                      >
                        −
                      </button>
                      <span className="w-14 text-center font-semibold tabular-nums" aria-live="polite">
                        {transferMinutes} min
                      </span>
                      <button
                        onClick={() => setTransferMinutes((m) => Math.min(10, m + 1))}
                        disabled={transferMinutes >= 10}
                        aria-label="More time to change"
                        className="grid size-11 place-items-center rounded-full bg-neutral-100 text-xl font-bold disabled:opacity-40 dark:bg-neutral-800"
                      >
                        +
                      </button>
                    </span>
                  </div>
                )}

                <div className="space-y-1">
                  <button onClick={() => setConfirmed(true)} disabled={!transferDone} className={`w-full ${primaryButton}`}>
                    Done
                  </button>
                  <button onClick={() => setChanges(false)} className={`w-full justify-center ${linkButton}`}>
                    Remove the change
                  </button>
                </div>
              </div>
            </Card>
          )}
        </Step>
      )}

      <Step n={whenStep} title="When do you usually leave?" hint="NextTrain shows this trip on Home during this time.">
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
      {changes && !confirmed && <p className="text-center text-sm text-neutral-500">Tap Done to finish your change first.</p>}
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
  const results = stations && query.trim() ? searchStations(stations, query, 6) : []
  return (
    <div className="space-y-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Search stations or bus stops" onSubmit={() => results[0] && onPick(results[0].mbtaStopId)} />
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

function Step({ n, title, hint, children }: { n: number | undefined; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="font-bold">
          {n}. {title}
        </h2>
        {hint && <p className="text-sm text-neutral-500">{hint}</p>}
      </div>
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
