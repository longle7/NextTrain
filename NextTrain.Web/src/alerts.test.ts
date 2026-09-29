import { describe, expect, it } from 'vitest'
import { alertsFor, effectLabel, majorAlert } from './alerts'
import type { Alert, AlertEntity } from './api'

const entity = (routeId: string | null, stopId: string | null = null, directionId: number | null = null): AlertEntity => ({
  routeId, stopId, directionId,
})
const alert = (id: string, severity: number, effect: string, ...entities: AlertEntity[]): Alert => ({
  id, severity, effect, entities, summary: id, header: id, description: null, timeframe: null, url: null,
})

// Shaped like real MBTA alerts: a Green Line suspension listing Park Street, a Symphony closure,
// a Red Line delay covering the whole line, and an inbound-only stop skip at Dean Road.
const greenSuspension = alert('green-suspension', 7, 'SUSPENSION', entity('Green-B', 'place-pktrm'), entity('Green-E', 'place-pktrm'))
const symphonyClosed = alert('symphony-closed', 7, 'STATION_CLOSURE', entity('Green-E', 'place-symcl'))
const redDelay = alert('red-delay', 5, 'DELAY', entity('Red'))
const deanRoadInbound = alert('dean-road', 7, 'STATION_CLOSURE', entity('Green-C', 'place-denrd', 1))
const savinStairs = alert('savin-stairs', 1, 'STATION_ISSUE', entity('Red', 'place-shmnl'))
const all = [savinStairs, redDelay, symphonyClosed, greenSuspension, deanRoadInbound]
const ids = (alerts: Alert[]) => alerts.map((a) => a.id)

describe('alertsFor', () => {
  it('a line gets every alert on it, worst first (suspension before a closure of equal severity)', () => {
    expect(ids(alertsFor(all, { routeIds: ['Green-E'] }))).toEqual(['green-suspension', 'symphony-closed'])
    expect(ids(alertsFor(all, { routeIds: ['Red'] }))).toEqual(['red-delay', 'savin-stairs'])
  })

  it('a station gets whole-line alerts and alerts naming it, not other stations', () => {
    expect(ids(alertsFor(all, { routeIds: ['Green-B', 'Green-E', 'Red'], stopId: 'place-pktrm' }))).toEqual([
      'green-suspension',
      'red-delay',
    ])
  })

  it('a direction skips alerts for the other direction only', () => {
    expect(ids(alertsFor(all, { routeIds: ['Green-C'], stopId: 'place-denrd', directionId: 1 }))).toEqual(['dean-road'])
    expect(alertsFor(all, { routeIds: ['Green-C'], stopId: 'place-denrd', directionId: 0 })).toEqual([])
  })

  it('an alert with no route applies everywhere', () => {
    const systemWide = alert('system', 3, 'DELAY', entity(null))
    expect(ids(alertsFor([systemWide], { routeIds: ['Blue'], stopId: 'place-wondl' }))).toEqual(['system'])
  })
})

it('majorAlert ignores minor station issues', () => {
  expect(majorAlert(alertsFor(all, { routeIds: ['Red'], stopId: 'place-shmnl' }))?.id).toBe('red-delay')
  expect(majorAlert([savinStairs])).toBeUndefined()
})

it('effectLabel has a fallback for effects it does not know', () => {
  expect(effectLabel('SHUTTLE')).toBe('Shuttle buses')
  expect(effectLabel('SNOW_ROUTE')).toBe('Service alert')
})
