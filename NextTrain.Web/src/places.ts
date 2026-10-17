import { searchStations, type Station } from './api'
import { loadMapKit } from './mapkit'

/** Where a trip starts or ends: an address, a place, a station or stop, or where you are. */
export interface Place {
  name: string
  latitude: number
  longitude: number
}

/** A match for what's typed: a station or stop (already a place), or one of Apple's, looked up when picked. */
export interface Suggestion {
  name: string
  detail: string
  place?: Place
  result?: mapkit.SearchAutocompleteResult
}

// Where the T runs, roughly: Apple only suggests places inside it.
const T_AREA = { north: 42.7, east: -70.8, south: 42.1, west: -71.4 }

let search: Promise<mapkit.Search> | undefined
const searcher = () =>
  (search ??= loadMapKit()
    .then(() => new mapkit.Search({
      region: new mapkit.BoundingRegion(T_AREA.north, T_AREA.east, T_AREA.south, T_AREA.west).toCoordinateRegion(),
      regionPriority: mapkit.Search.RegionPriority.Required,
      includeQueries: false, // addresses and places, not searches like "coffee"
    }))
    .catch((error) => {
      search = undefined // offline, say: try again next time
      throw error
    }))

/** Starts loading Apple's MapKit (about 240 KB) when an address field gets focus, so suggestions come quickly. */
export const preparePlaces = () => void searcher().catch(() => {})

/**
 * Matches for what's typed: stations and stops by name first (from the lists the app already has), then Apple's
 * addresses and places. Typed text goes to Apple; the station match stays on the device. Without MapKit (offline, or
 * no map on this server) stations still match.
 */
export async function suggestPlaces(query: string, stops: Station[]): Promise<Suggestion[]> {
  const stations = searchStations(stops, query, 3).map((s): Suggestion => ({
    name: s.name, detail: s.routeId ? 'Station' : 'Bus stop', place: { name: s.name, latitude: s.latitude, longitude: s.longitude },
  }))
  const apple = await searcher()
    .then((s) => new Promise<mapkit.SearchAutocompleteResult[]>((resolve, reject) =>
      s.autocomplete(query, (error, data) => (error ? reject(error) : resolve(data.results)))))
    .catch(() => [])
  return [...stations, ...apple.slice(0, 5).map((result) => ({ name: result.displayLines[0], detail: result.displayLines.slice(1).join(', '), result }))]
}

/** Where a suggestion is: a station's own coordinates, Apple's suggestion's, or Apple's search for it. */
export async function placeOf(suggestion: Suggestion): Promise<Place | undefined> {
  if (suggestion.place) return suggestion.place
  const result = suggestion.result!
  const coordinate = result.coordinate ?? (await searcher().then((s) => new Promise<mapkit.Place | undefined>((resolve, reject) =>
    s.search(result, (error, data) => (error ? reject(error) : resolve(data.places[0]))))))?.coordinate
  return coordinate && { name: suggestion.name, latitude: coordinate.latitude, longitude: coordinate.longitude }
}
