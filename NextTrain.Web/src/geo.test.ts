import { describe, expect, it } from 'vitest'
import type { Station } from './api'
import { boundsOf, distanceMiles, nearestStations, walkLabel } from './geo'

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
