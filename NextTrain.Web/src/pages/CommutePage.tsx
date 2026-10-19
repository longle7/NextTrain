import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import {
  api, ApiError, busDirections, busRouteIds, findRoute, getBusStops, getRoutes, getStations, isSubwayRoute, lineLabel, ROUTES, routeName,
  searchStations, stationRouteIds, towardLabel,
  type Commute, type CommuteInput, type Route, type Station,
} from '../api'
import { forget } from '../cache'
import { CHANGE_WALK_MINUTES, changeOptions, type CatchPoint } from '../changes'
import { stepNumbers, WEEK } from '../commutes'
import { Card, dangerButton, LineBadge, linkButton, NotFound, primaryButton, SearchInput, secondaryButton, Status, StopName } from '../components'
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
  // Stations first, so a search for "Harvard" offers the station before the bus stops near it. Joined once, not on
  // every keystroke: there are ~7,000.
  const allStops = useMemo(
    () => (stations.data && busStops.data ? [...stations.data, ...busStops.data] : stations.data),
    [stations.data, busStops.data],
  )

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
  const [lineQuery, setLineQuery] = useState('') // "Which bus or line?": "22"
  const [transferDirectionId, setTransferDirectionId] = useState(existing?.transferDirectionId)
  const [transferMinutes, setTransferMinutes] = useState(existing?.transferMinutes ?? 3)
  // Done tapped: the change shows as a one-line summary. A saved change opens that way.
  const [confirmed, setConfirmed] = useState(!!existing?.transferStopId)

  const station = allStops?.find((s) => s.mbtaStopId === stopId)
  // The same list until the stop changes, so the change options below aren't worked out again on every render.
  const stationRoutes = useMemo(() => (station ? [...stationRouteIds(station), ...busRouteIds(station)] : []), [station])
  // A single-line station needs no choice.
  const chosenRouteId = stationRoutes.includes(routeId) ? routeId : stationRoutes.length === 1 ? stationRoutes[0] : undefined
  const route = findRoute(routes.data, chosenRouteId ?? '')
  // A train goes both ways from a station; a bus usually just one way from a stop (each side of the street is its own
  // stop), and then there's no choice to make.
  const directions = route?.type === 'bus' && station ? busDirections(station, route.id) : [0, 1]
  const chosenDirection =
    directionId !== undefined && directions.includes(directionId) ? directionId : directions.length === 1 ? directions[0] : undefined
  // Where you can change, by the route you change to: the first ride's later stops, and every station or stop within
  // a 5-minute walk of one (changes.ts), so the 66 offers the 22 a minute's walk away at Columbus Ave @ Malcolm X Blvd.
  const ridePath = chosenRouteId && chosenDirection !== undefined
    ? `/stations?route=${encodeURIComponent(chosenRouteId)}&direction=${chosenDirection}&sort=line`
    : ''
  const ride = usePolling(() => (changes && ridePath ? api<Station[]>(ridePath) : Promise.resolve<Station[]>([])), `${ridePath}|${changes}`)
  const nameOf = (id: string) => routeName(id, findRoute(routes.data, id))
  const badgeOf = (id: string) => lineLabel(id, findRoute(routes.data, id)) // "22", "OL"
  const boardingAt = ride.data?.findIndex((s) => s.mbtaStopId === station?.mbtaStopId) ?? -1
  // Every later stop against every stop: worked out when the ride changes, not on each keystroke of "Which bus or line?".
  const options = useMemo(
    () => (changes && ride.data && boardingAt >= 0 && allStops && chosenRouteId
      ? changeOptions(ride.data.slice(boardingAt + 1), allStops, chosenRouteId)
      : undefined),
    [changes, ride.data, boardingAt, allStops, chosenRouteId],
  )
  // The T first, then buses by number; typing "22" (or "orange") narrows them.
  const reachable = [...(options?.keys() ?? [])]
    .sort((a, b) => Number(!isSubwayRoute(a)) - Number(!isSubwayRoute(b)) || badgeOf(a).localeCompare(badgeOf(b), undefined, { numeric: true }))
  const q = lineQuery.trim().toLowerCase()
  const matching = q ? reachable.filter((id) => badgeOf(id).toLowerCase().startsWith(q) || (q.length > 1 && nameOf(id).toLowerCase().includes(q))) : reachable
  const chosenTransferRoute = options?.has(transferRouteId) ? transferRouteId : undefined
  const transferRoute = findRoute(routes.data, chosenTransferRoute ?? '')
  const catchPoints = (chosenTransferRoute && options?.get(chosenTransferRoute)) || []
  const catchPoint = catchPoints.find((p) => p.on.mbtaStopId === transferStopId)
  const changeStation = catchPoint?.on
  const transferDirections = transferRoute?.type === 'bus' && changeStation ? busDirections(changeStation, transferRoute.id) : [0, 1]
  const chosenTransferDirection = transferDirectionId !== undefined && transferDirections.includes(transferDirectionId)
    ? transferDirectionId
    : transferDirections.length === 1 ? transferDirections[0] : undefined
  const transferDone = !changes || (!!catchPoint && chosenTransferDirection !== undefined)
  const pickLine = (id: string) => {
    setTransferRouteId(id)
    setTransferStopId('')
    setTransferDirectionId(undefined)
  }
  const pickCatchPoint = ({ on, walk }: CatchPoint) => {
    setTransferStopId(on.mbtaStopId)
    setTransferDirectionId(undefined)
    setTransferMinutes(walk ? Math.min(10, walk + 1) : 3) // the walk and a minute; 3 to change platforms
  }
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
        transferStopId: catchPoint!.on.mbtaStopId, transferRouteId: chosenTransferRoute, transferDirectionId: chosenTransferDirection,
        transferMinutes, transferFromStopId: catchPoint!.walk ? catchPoint!.off.mbtaStopId : undefined,
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
              <span>
                <StopName station={station} className="font-semibold" />
              </span>
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
          title="Do you change trains/buses?"
          hint={changes ? 'What you catch next, and where.' : 'For example, the Green Line to the Blue Line at Government Center, or the 66 to the 22.'}
        >
          {!changes ? (
            <button onClick={() => setChanges(true)} className={secondaryButton}>
              <span aria-hidden>+</span> Add a change
            </button>
          ) : confirmed && catchPoint && transferRoute && chosenTransferDirection !== undefined ? (
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {catchPoint.walk ? (
                      // One inline sentence, not flex items: the row's gap would put a space before the comma.
                      <span>
                        Get off at <strong>{catchPoint.off.name}</strong>, walk {catchPoint.walk} min to <strong>{catchPoint.on.name}</strong> for
                      </span>
                    ) : (
                      <>
                        Change at <strong>{catchPoint.on.name}</strong> to
                      </>
                    )}
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
                  <h3 className="text-sm font-semibold text-neutral-500 uppercase">Which bus or line?</h3>
                  {!options ? (
                    <Status loading rows={1} />
                  ) : reachable.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No other line or bus stops within a {CHANGE_WALK_MINUTES}-minute walk of this ride after {station?.name}.
                    </p>
                  ) : transferRoute ? (
                    <div className="flex items-center justify-between gap-2">
                      <LineName id={transferRoute.id} routes={routes.data} />
                      <button onClick={() => pickLine('')} className={linkButton}>
                        Change<span className="sr-only"> the bus or line</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* What you can catch along this ride (the same stop, or up to a 5-minute walk); typing narrows it. */}
                      <SearchInput value={lineQuery} onChange={setLineQuery} placeholder="Which bus or line? e.g. 22" onSubmit={() => matching[0] && pickLine(matching[0])} />
                      {matching.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                          No line or bus “{lineQuery.trim()}” within a {CHANGE_WALK_MINUTES}-minute walk of this ride.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {matching.map((id) => (
                            <button
                              key={id}
                              onClick={() => pickLine(id)}
                              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-neutral-100 px-3 text-sm font-semibold active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
                            >
                              <span className="text-neutral-500 dark:text-neutral-400">{isSubwayRoute(id) ? 'T:' : 'Bus:'}</span>
                              <span aria-hidden>
                                <LineBadge routeId={id} routes={routes.data} />
                              </span>
                              <span className="sr-only">{nameOf(id)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {transferRoute && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-neutral-500 uppercase">Where do you catch it?</h3>
                    {catchPoint ? (
                      <div className="flex items-center justify-between gap-2">
                        <CatchPlace point={catchPoint} />
                        <button onClick={() => setTransferStopId('')} className={linkButton}>
                          Change<span className="sr-only"> where you catch it</span>
                        </button>
                      </div>
                    ) : (
                      <ul className="-mx-1 divide-y divide-neutral-100 dark:divide-neutral-800">
                        {catchPoints.map((p) => (
                          <li key={p.on.mbtaStopId}>
                            <button
                              onClick={() => pickCatchPoint(p)}
                              className="flex min-h-12 w-full items-center rounded-lg px-1 py-1 text-left active:bg-neutral-100 dark:active:bg-neutral-800"
                            >
                              <CatchPlace point={p} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                      <span className="block text-sm text-neutral-500">{catchPoint?.walk ? 'Including the walk' : 'Platform to platform'}</span>
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
                <StopName station={s} />
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

// "Bus: 22 Ashmont Station - Ruggles Station", or "T: OL Orange Line": a line or bus to change to.
function LineName({ id, routes }: { id: string; routes: Route[] | undefined }) {
  const route = findRoute(routes, id)
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">{isSubwayRoute(id) ? 'T:' : 'Bus:'}</span>
      <span aria-hidden>
        <LineBadge routeId={id} routes={routes} />
      </span>
      <span className="min-w-0 truncate font-semibold">{route?.name ?? routeName(id, route)}</span>
    </span>
  )
}

// Where to catch the next ride: "Bus: Columbus Ave @ Malcolm X Blvd (near …)", then "1 min walk from Tremont St @
// Columbus Ave", or "T stop: Park Street", then "Same station".
function CatchPlace({ point: { off, on, walk } }: { point: CatchPoint }) {
  return (
    <span className="min-w-0">
      <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">{on.routeId ? 'T stop: ' : 'Bus: '}</span>
      <StopName station={on} className="font-semibold" />
      <span className="block text-sm text-neutral-500">
        {walk ? `${walk} min walk from ${off.name}` : on.routeId ? 'Same station' : 'Same stop'}
      </span>
    </span>
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
