import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Station } from './api'
import { boundsOf, distanceMiles, locationRemembered, nearestStations, rememberLocation, tripStops, tripStopsParam, walkLabel, walkMinutes } from './geo'

const station = (mbtaStopId: string, latitude: number, longitude: number): Station => ({
  mbtaStopId, name: mbtaStopId, latitude, longitude, routeId: 'Red', averageWeekdayBoardings: null, isAccessible: null,
})

const parkStreet = station('place-pktrm', 42.3564, -71.0624)
const governmentCenter = station('place-gover', 42.3597, -71.0592)
const alewife = station('place-alfcl', 42.3958, -71.1418)

describe('distanceMiles', () => {
  it('matches the known Park Street to Alewife distance (~4.9 mi)', () => {
    expect(distanceMiles(parkStreet, alewife)).toBeCloseTo(4.87, 1)
  })
})

describe('nearestStations', () => {
  it('sorts by distance and keeps `count`', () => {
    const here = { latitude: 42.358, longitude: -71.06 } // between Park Street and Government Center, closer to Gov Center
    expect(nearestStations([alewife, parkStreet, governmentCenter], here, 2).map((n) => n.station.mbtaStopId)).toEqual([
      'place-gover',
      'place-pktrm',
    ])
  })
})

describe('walkLabel', () => {
  it.each([
    [0.02, '<0.1 mi · 1 min walk'],
    [0.4, '0.4 mi · 10 min walk'],
    [3.24, '3.2 mi away'],
  ])('%s mi is "%s"', (miles, expected) => {
    expect(walkLabel(miles)).toBe(expected)
  })
})

describe('boundsOf', () => {
  it('is the box around the points, widened by the margin on every side', () => {
    const b = boundsOf([[42.4, -71.2], [42.2, -71.0], [42.3, -71.1]], 0.1)!
    expect(b.north).toBeCloseTo(42.42)
    expect(b.south).toBeCloseTo(42.18)
    expect(b.east).toBeCloseTo(-70.98)
    expect(b.west).toBeCloseTo(-71.22)
  })

  it('is undefined for no points, and a point for one point', () => {
    expect(boundsOf([])).toBeUndefined()
    expect(boundsOf([[42.36, -71.06]])).toEqual({ north: 42.36, south: 42.36, east: -71.06, west: -71.06 })
  })
})

describe('remembered location', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is remembered once used, and forgotten when refused', () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => stored.set(k, v),
      removeItem: (k: string) => stored.delete(k),
    })
    expect(locationRemembered()).toBe(false)
    rememberLocation(true)
    expect(locationRemembered()).toBe(true)
    rememberLocation(false)
    expect(locationRemembered()).toBe(false)
  })

  it('is not assumed when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    rememberLocation(true)
    expect(locationRemembered()).toBe(false)
  })
})

describe('tripStops', () => {
  // Bus stops 0.05 mi apart going north from Park Street, so the nth is n/20 mi away.
  const busStop = (n: number) => ({ ...station(`bus${n}`, 42.3564 + (n / 20) * 0.01449, -71.0624), routeId: '', busRoutes: '1:0' })
  const busStops = Array.from({ length: 12 }, (_, i) => busStop(i + 1))
  const here = { latitude: 42.3570, longitude: -71.0624 } // just north of Park Street, nearer bus1 than the station

  it('keeps the T stations even when bus stops are closer, then the nearest bus stops, 8 in all', () => {
    const stops = tripStops([alewife, parkStreet, governmentCenter], busStops, here)
    expect(stops.map((n) => n.station.mbtaStopId)).toEqual(['place-pktrm', 'place-gover', 'bus1', 'bus2', 'bus3', 'bus4', 'bus5', 'bus6'])
  })

  it('leaves out stops more than half a mile away', () => {
    const stops = tripStops([alewife], busStops, here)
    expect(stops.map((n) => n.station.mbtaStopId)).toEqual(['bus1', 'bus2', 'bus3', 'bus4', 'bus5', 'bus6', 'bus7', 'bus8'])
    expect(tripStops([alewife], [], { latitude: 42.2, longitude: -71.3 })).toEqual([])
  })

  it('sends each stop with the minutes walkLabel would show', () => {
    expect(walkMinutes(0)).toBe(1)
    expect(walkMinutes(0.4)).toBe(10) // as in "0.4 mi · 10 min walk"
    expect(walkMinutes(0.5)).toBe(13)
    expect(tripStopsParam([{ station: parkStreet, miles: 0.02 }, { station: busStop(1), miles: 0.4 }])).toBe('place-pktrm:1,bus1:10')
  })
})
