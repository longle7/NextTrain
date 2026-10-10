import { describe, expect, it } from 'vitest'
import { alertsFor, effectLabel, majorAlert, plannedFor } from './alerts'
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

describe('plannedFor', () => {
  // Saturday, October 10, 2026, noon in Boston.
  const now = new Date('2026-10-10T12:00:00-04:00')
  const planned = (id: string, start: string, end: string | null, ...entities: AlertEntity[]): Alert => ({
    ...alert(id, 4, 'SHUTTLE', ...entities), start, end,
  })
  // MBTA periods run 3 AM to 3 AM: this covers Saturday and Sunday the 17th-18th.
  const blueWeekend = planned('blue-weekend', '2026-10-17T03:00:00-04:00', '2026-10-19T03:00:00-04:00', entity('Blue'))
  const redTuesday = planned('red-tuesday', '2026-10-13T03:00:00-04:00', '2026-10-14T03:00:00-04:00', entity('Red', 'place-pktrm'))
  const redNextMonth = planned('red-later', '2026-10-25T03:00:00-04:00', null, entity('Red'))
  const upcoming = [blueWeekend, redTuesday, redNextMonth]

  it('finds the soonest change on the commute\'s line and station, on one of its days, within a week', () => {
    expect(plannedFor(upcoming, { routeIds: ['Red'], stopId: 'place-pktrm' }, 'Mon,Tue,Wed,Thu,Fri', now)?.id).toBe('red-tuesday')
    expect(plannedFor(upcoming, { routeIds: ['Blue'] }, 'Sat,Sun', now)?.id).toBe('blue-weekend')
  })

  it('skips changes on days the commute doesn\'t run, at other stations, or more than a week away', () => {
    expect(plannedFor(upcoming, { routeIds: ['Blue'] }, 'Mon,Tue,Wed,Thu,Fri', now)).toBeUndefined() // weekend only
    expect(plannedFor(upcoming, { routeIds: ['Red'], stopId: 'place-alfcl' }, 'Tue', now)).toBeUndefined() // Park Street only
    expect(plannedFor([redNextMonth], { routeIds: ['Red'] }, 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', now)).toBeUndefined()
  })
})
