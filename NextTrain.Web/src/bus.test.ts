import { describe, expect, it } from 'vitest'
import {
  busDirections, busRouteIds, findRoute, isSubwayRoute, lineLabel, searchRoutes, searchStations, stationRouteIds, towardLabel,
  type Route, type Station,
} from './api'
import { trainsByStation } from './lineTrains'
import { liveActivityDetails } from './liveActivity'
import { trainCallout } from './mapkit'

// Buses: route IDs aren't route numbers (SL1 is "741"), and each side of the street is its own stop.
const route = (id: string, shortName: string, destinations: string[], type: Route['type'] = 'bus'): Route => ({
  id, name: destinations.join(' - '), color: '#FFC72C', textColor: '#000000', directionNames: ['Outbound', 'Inbound'],
  directionDestinations: destinations, type, shortName,
})
const routes = [
  route('Green-B', 'B', ['Boston College', 'Government Center'], 'subway'),
  route('741', 'SL1', ['Logan Airport Terminals', 'South Station']),
  route('1', '1', ['Harvard Square', 'Nubian Station']),
  route('10', '10', ['City Point', 'Copley Square']),
  route('66', '66', ['Harvard Square', 'Nubian Station']),
  route('116', '116', ['Wonderland', 'Maverick']),
]
const stop = (id: string, name: string, busRoutes: string, routeId = ''): Station => ({
  mbtaStopId: id, name, latitude: 0, longitude: 0, routeId, busRoutes, averageWeekdayBoardings: null, isAccessible: null,
})

describe('routes', () => {
  it('finds a route by its exact ID: route 1 is not route 10', () => {
    expect(findRoute(routes, '1')?.shortName).toBe('1')
    expect(findRoute(routes, '10')?.shortName).toBe('10')
    expect(findRoute(routes, 'Green')?.id).toBe('Green-B') // all Green branches: the first
    expect(findRoute(routes, '9')).toBeUndefined()
  })

  it('labels a bus by its number, never its ID, and the subway as before', () => {
    expect(lineLabel('741', findRoute(routes, '741'))).toBe('SL1')
    expect(lineLabel('1', findRoute(routes, '1'))).toBe('1')
    expect(lineLabel('66')).toBe('66') // before routes load: the ID, which for most buses is the number
    expect([lineLabel('Red'), lineLabel('Green-B'), lineLabel('Mattapan')]).toEqual(['RL', 'GL B', 'M'])
    expect(['Red', 'Green-E', 'Mattapan', '1', '741', 'CT3'].map(isSubwayRoute)).toEqual([true, true, true, false, false, false])
  })

  it('searches bus routes by number first, then by number prefix, then by where they go', () => {
    expect(searchRoutes(routes, '1').map((r) => r.shortName)).toEqual(['1', '10', '116'])
    expect(searchRoutes(routes, 'sl1').map((r) => r.shortName)).toEqual(['SL1'])
    expect(searchRoutes(routes, 'nubian').map((r) => r.shortName)).toEqual(['1', '66'])
    expect(searchRoutes(routes, 'B')).toEqual([]) // the subway isn't a bus route
  })
})

describe('bus stops', () => {
  const terminalA = stop('17091', 'Terminal A', '741:1')
  const southStation = stop('place-sstat', 'South Station', '741:1,742:1', 'Red')
  const nubian = stop('place-nubn', 'Nubian', '1:0,1:1,66:0')

  it('reads routes and directions from "route:direction" pairs', () => {
    expect(busRouteIds(nubian)).toEqual(['1', '66'])
    expect(busDirections(nubian, '1')).toEqual([0, 1])
    expect(busDirections(terminalA, '741')).toEqual([1]) // this side of the street only goes one way
    expect(busDirections(terminalA, '1')).toEqual([])
    expect(stationRouteIds(terminalA)).toEqual([]) // no subway at a bus-only stop
    expect(stationRouteIds(southStation)).toEqual(['Red'])
  })

  it('says where a stop\'s buses go, using route numbers', () => {
    expect(towardLabel(terminalA, routes)).toBe('SL1 toward South Station')
    expect(towardLabel(nubian, routes)).toBe('1 toward Harvard Square · 1 toward Nubian Station · +1 more')
    expect(towardLabel(nubian, routes, 3)).toBe('1 toward Harvard Square · 1 toward Nubian Station · 66 toward Harvard Square')
  })

  it('finds bus stops the way people type street names', () => {
    const stops = [stop('a', 'Massachusetts Ave @ Beacon St', '1:0'), stop('b', 'Beacon St @ Massachusetts Ave', '1:1'), stop('c', 'Boylston St', '39:0')]
    expect(searchStations(stops, 'mass ave at beacon').map((s) => s.mbtaStopId)).toEqual(['a', 'b'])
    expect(searchStations(stops, 'massachusetts avenue').map((s) => s.mbtaStopId)).toEqual(['a', 'b'])
  })
})

describe('buses on a route page and the map', () => {
  const sl1 = findRoute(routes, '741')!
  const stops = [stop('17091', 'Terminal A', '741:1'), stop('place-sstat', 'South Station', '741:1', 'Red')]
  const bus = (id: string, directionId: number, stationId: string) => ({
    id, routeId: '741', directionId, currentStatus: 'INCOMING_AT' as const, stationId, stopName: 'South Station',
    latitude: 0, longitude: 0, bearing: null, cars: [],
  })

  it('shows one direction at a time, every bus moving down the list, called a bus', () => {
    const placed = trainsByStation([bus('y1', 1, 'place-sstat'), bus('y2', 0, '17091')], sl1, stops, 1)
    expect([...placed.keys()]).toEqual(['place-sstat'])
    expect(placed.get('place-sstat')).toEqual([
      { id: 'y1', down: true, atStation: false, label: 'Bus to South Station, approaching South Station' },
    ])
  })

  it('titles a bus card "Route SL1 to South Station"', () => {
    expect(trainCallout(bus('y1', 1, 'place-sstat'), sl1).title).toBe('Route SL1 to South Station')
  })

  it('shows a bus commute in the Live Activity by its number and colors', () => {
    const commute = { id: 1, mbtaStopId: '17091', stationName: 'Terminal A', routeId: '741', directionId: 1, windowStart: '07:45:00', windowEnd: '08:15:00', activeDays: 'Mon' }
    const details = liveActivityDetails(commute, sl1, [], new Date(0), undefined)
    expect([details.lineName, details.destination, details.lineColor, details.lineTextColor]).toEqual(['SL1', 'South Station', '#FFC72C', '#000000'])
  })
})
