import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, getMapKitToken, NETWORK_MESSAGE, searchStations, TIMEOUT_MESSAGE, type Station } from './api'

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
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/mapkit/token')
    expect(init.headers).toBeUndefined() // no X-User-Id, and no CORS preflight
    expect(init.signal).toBeInstanceOf(AbortSignal) // times out like every request
  })

  it('throws an ApiError when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    await expect(getMapKitToken()).rejects.toMatchObject({ status: 403 })
  })
})

describe('api: requests that get no answer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gives every request a timeout signal', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await api('/routes')
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('turns a timeout into an ApiError (status 0) with a message people can act on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('signal timed out', 'TimeoutError')))
    const error = await api('/routes').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, message: TIMEOUT_MESSAGE })
  })

  it('turns a network failure (no connection, server unreachable) into its own message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api('/routes')).rejects.toMatchObject({ status: 0, message: NETWORK_MESSAGE })
  })

  it("still reports HTTP errors with the API's own message", async () => {
    const body = JSON.stringify({ title: 'Validation failed', errors: { WindowEnd: ['End must be after start.'] } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 400 })))
    await expect(api('/commutes')).rejects.toMatchObject({ status: 400, message: 'End must be after start.' })
  })
})
