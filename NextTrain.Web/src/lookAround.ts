import { remember, remembered } from './cache'
import { loadMapKit } from './mapkit'

// Apple's street view (Look Around) of a bus stop, on its page. Apple's terms don't let us save its imagery, so
// nothing of it is stored; only which stops have none.

// Stops Apple has no imagery for, found on earlier visits, so their page doesn't flash a box that then goes away.
// Kept with the other remembered answers (cache.ts), so Delete my data clears it.
const NONE = 'noStreetView'
export const hasStreetView = (stopId: string) => !remembered<string[]>(NONE)?.data.includes(stopId)

// The last stop's view, kept for the session like the map (MapPage's parked): leaving its page takes it off the page,
// coming back puts it back at once, where you left it looking, with nothing to load again.
// ponytail: the last stop only. MapKit runs one Look Around at a time (a second never loads), and a new view of a stop
// seen before loads the same imagery again (Apple's isn't cacheable). Keep more if MapKit ever allows several.
let parked: { stopId: string; view: mapkit.LookAround } | undefined

// The look-around library, on top of MapKit, the first time it's needed.
const library = () =>
  loadMapKit().then(() => {
    if (mapkit.loadedLibraries.includes('look-around')) return
    return new Promise<void>((resolve, reject) => {
      mapkit.addEventListener('load', (event) => event.libraries.includes('look-around') && resolve())
      mapkit.addEventListener('load-error', (event) => event.libraries.includes('look-around') && reject(new Error("Look Around didn't load")))
      mapkit.load(['look-around'])
    })
  })

/**
 * Shows a stop's street view in `host`, then `done(true)` once it's loaded, or `done(false)` if there's none (Apple has
 * no imagery there, or MapKit can't load). Returns the cleanup, which takes the view off the page but keeps it.
 */
export function showLookAround(host: HTMLElement, stopId: string, latitude: number, longitude: number, done: (shown: boolean) => void) {
  let live = true
  library().then(
    () => {
      if (!live) return
      if (parked?.stopId === stopId) host.append(parked.view.element)
      else {
        parked?.view.destroy()
        const view = new mapkit.LookAround(host, new mapkit.Coordinate(latitude, longitude))
        view.addEventListener('error', (event) => {
          if (event.detail.type === 'availability-error') remember(NONE, [...(remembered<string[]>(NONE)?.data ?? []), stopId])
          view.destroy()
          if (parked?.view === view) parked = undefined
        })
        parked = { stopId, view }
      }
      const { view } = parked
      if (view.readyState === 'complete') return done(true)
      view.addEventListener('load', () => live && done(true))
      view.addEventListener('error', () => live && done(false))
    },
    () => live && done(false),
  )
  return () => {
    live = false
    if (parked?.stopId === stopId) parked.view.element.remove()
  }
}
