import { expect, it } from 'vitest'
import { searchStations, type Station } from './api'

const station = (name: string): Station => ({
  mbtaStopId: name, name, latitude: 0, longitude: 0, routeId: 'Red', averageWeekdayBoardings: null, isAccessible: null,
})

// Real station names (alphabetical, as the API returns them), plus "Parker" to test prefix ranking.
const stations = [
  'Charles/MGH', 'Downtown Crossing', 'Government Center', 'Harvard', 'Harvard Avenue', 'Massachusetts Avenue',
  'Museum of Fine Arts', 'Newton Centre', 'Park Street', 'Parker', "Saint Mary's Street", 'State',
].map(station)
const search = (query: string) => searchStations(stations, query).map((s) => s.name)

it('puts names starting with the query first, case-insensitively', () => {
  expect(search('  PAR')).toEqual(['Park Street', 'Parker'])
  expect(search(' ')).toEqual([])
})

it.each([
  ['harvard sq', ['Harvard', 'Harvard Avenue']], // "Square" isn't in the name
  ['park st station', ['Park Street']],
  ['st marys', ["Saint Mary's Street"]], // "st" for Saint, apostrophe ignored
  ['gov ctr', ['Government Center']],
  ['mass ave', ['Massachusetts Avenue']],
  ['newton center', ['Newton Centre']],
  ['mgh', ['Charles/MGH']],
  ['mfa', ['Museum of Fine Arts']],
  ['town', ['Downtown Crossing']], // still finds a match inside a word, last
])('"%s" finds %j', (query, expected) => {
  expect(search(query)).toEqual(expected)
})

it('does not match on optional words alone or on unrelated words', () => {
  expect(search('station')).toEqual([])
  expect(search('harvard zzz')).toEqual([])
})
