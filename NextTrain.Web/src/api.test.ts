import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMapKitToken, searchStations, type Station } from './api'

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

describe('getMapKitToken', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the token text from /mapkit/token, without the user ID', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('eyJ.token.sig', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await getMapKitToken()).toBe('eyJ.token.sig')
    expect(fetch).toHaveBeenCalledWith('/api/mapkit/token') // no headers at all: no X-User-Id, no CORS preflight
  })

  it('throws an ApiError when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    await expect(getMapKitToken()).rejects.toMatchObject({ status: 403 })
  })
})
