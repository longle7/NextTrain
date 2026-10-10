import { describe, expect, it } from 'vitest'
import type { Prediction } from './api'
import { agoLabel, clock, countdown, departureLabel, groupDepartures, noTrainsMessage, secondsAgo } from './time'

const now = new Date('2026-09-29T08:00:00-04:00')
const at = (secondsFromNow: number) => new Date(now.getTime() + secondsFromNow * 1000).toISOString()

describe('countdown', () => {
  it.each([
    [-60, undefined],
    [-10, 'Boarding'],
    [30, 'Boarding'],
    [45, 'Approaching'],
    [61, '1 min'],
    [150, '3 min'],
    [20 * 60, '20 min'],
  ])('%is from now is %s', (seconds, expected) => {
    expect(countdown(at(seconds), now)).toBe(expected)
  })
})

describe('groupDepartures', () => {
  const p = (routeId: string, directionId: number, departureSeconds: number): Prediction => ({
    routeId,
    directionId,
    departureTime: at(departureSeconds),
  })

  it('groups by route and direction, soonest first, dropping departed trains', () => {
    const groups = groupDepartures(
      [p('Red', 1, 600), p('Red', 1, 120), p('Orange', 0, 300), p('Red', 0, -120)],
      now,
    )

    expect(groups.map((g) => [g.routeId, g.directionId, g.departures.length])).toEqual([
      ['Orange', 0, 1],
      ['Red', 1, 2],
    ])
    expect(groups[1].departures).toEqual([at(120), at(600)])
  })

  it('keeps at most perGroup departures', () => {
    const groups = groupDepartures([p('Red', 0, 100), p('Red', 0, 200), p('Red', 0, 300)], now, 2)

    expect(groups[0].departures).toEqual([at(100), at(200)])
  })
  it('marks a group from the timetable as scheduled, and live groups as not', () => {
    const groups = groupDepartures([p('Red', 0, 120), { ...p('Green-B', 1, 900), scheduled: true }, { ...p('Green-B', 1, 1500), scheduled: true }], now)

    expect(groups.map((g) => [g.routeId, g.scheduled, g.departures.length])).toEqual([
      ['Green-B', true, 2],
      ['Red', false, 1],
    ])
  })
})

describe('departureLabel', () => {
  it('counts down to a live departure, and gives a scheduled one as its clock time', () => {
    expect(departureLabel(at(150), false, now)).toBe('3 min')
    expect(departureLabel(at(150), true, now)).toBe(clock(at(150)))
  })
})

describe('secondsAgo', () => {
  it('never goes negative', () => {
    expect(secondsAgo(new Date(now.getTime() + 5000), now)).toBe(0)
    expect(secondsAgo(new Date(now.getTime() - 12_400), now)).toBe(12)
  })
})

describe('agoLabel', () => {
  it.each([
    [0, '0s ago'],
    [59, '59s ago'],
    [60, '1 min ago'],
    [185, '3 min ago'],
  ])('%is is "%s"', (seconds, expected) => {
    expect(agoLabel(seconds)).toBe(expected)
  })
})

describe('noTrainsMessage', () => {
  const at = (hour: number) => new Date(2026, 8, 29, hour, 30)

  it('points to the alert when one explains the gap, even at night', () => {
    expect(noTrainsMessage(true, at(15))).toMatch(/See the service alert above/)
    expect(noTrainsMessage(true, at(2))).toMatch(/See the service alert above/)
  })

  it('says the subway is closed only overnight', () => {
    expect(noTrainsMessage(false, at(2))).toMatch(/closed overnight/)
    expect(noTrainsMessage(false, at(15))).toMatch(/Check back in a minute/)
    expect(noTrainsMessage(false, at(0))).toMatch(/Check back in a minute/) // last trains run past midnight
  })
})
