import { expect, it } from 'vitest'
import { searchStations, type Station } from './api'

const station = (name: string): Station => ({
  mbtaStopId: name, name, latitude: 0, longitude: 0, routeId: 'Red', averageWeekdayBoardings: null,
})

it('searchStations matches anywhere, case-insensitively, names starting with the query first', () => {
  const stations = ['Downtown Crossing', 'Park Street', 'Harvard', 'Parker'].map(station)

  expect(searchStations(stations, '  PAR').map((s) => s.name)).toEqual(['Park Street', 'Parker'])
  expect(searchStations(stations, 'town').map((s) => s.name)).toEqual(['Downtown Crossing'])
  expect(searchStations(stations, ' ')).toEqual([])
})
