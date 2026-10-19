import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, connectionsPath, getMapKitToken, getTrips, NETWORK_MESSAGE, searchStations, TIMEOUT_MESSAGE, type Commute, type Station } from './api'

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

describe('getTrips', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("asks for trips without the user ID, and passes on the API's message", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await getTrips('/trips?from=1308:4&to=place-gover:3')).toEqual([])
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/trips?from=1308:4&to=place-gover:3')
    expect(init.headers).toBeUndefined() // no X-User-Id
    fetch.mockResolvedValue(new Response(JSON.stringify({ errors: { from: ['Bad stops.'] } }), { status: 400 }))
    await expect(getTrips('/trips?from=x&to=y')).rejects.toMatchObject({ status: 400, message: 'Bad stops.' })
  })
})

describe('api: headers (each one makes the browser send a CORS preflight first)', () => {
  afterEach(() => vi.unstubAllGlobals())

  const headersFor = async (path: string, init?: RequestInit) => {
    const fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await api(path, init)
    return fetch.mock.calls[0][1].headers as Record<string, string>
  }

  it.each(['/stations/place-pktrm/predictions?schedules=true', '/alerts', '/vehicles', '/connections?from=1', '/mechanics', '/commutesx'])(
    'sends a plain GET for %s: no user ID, no Content-Type',
    async (path) => {
      expect(await headersFor(path)).toEqual({})
    },
  )

  it.each(['/commutes', '/commutes/5', '/me', '/me/live-activity', '/me?x=1'])('sends the user ID to %s, which owns data', async (path) => {
    expect(Object.keys(await headersFor(path))).toEqual(['X-User-Id'])
  })

  it('types a JSON body', async () => {
    const headers = await headersFor('/commutes', { method: 'POST', body: '{}' })
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-User-Id']).toBeTruthy()
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

describe('connectionsPath', () => {
  const commute: Commute = {
    id: 1, mbtaStopId: '1308', stationName: 'Harvard St @ Beacon St', routeId: '66', directionId: 1,
    windowStart: '07:45:00', windowEnd: '08:15:00', activeDays: 'Mon',
    transferStopId: '1222', transferRouteId: '22', transferDirectionId: 1, transferMinutes: 2,
  }

  it('times the first ride where the rider gets off when the change is a walk', () => {
    expect(connectionsPath({ ...commute, transferFromStopId: '1323' })).toBe(
      '/connections?from=1308&route=66&direction=1&via=1222&toRoute=22&toDirection=1&minutes=2&off=1323')
  })

  it('leaves off out for a change at the same stop, as before', () => {
    expect(connectionsPath(commute)).not.toContain('off=')
  })
})
