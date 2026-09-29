import { describe, expect, it } from 'vitest'
import type { Prediction } from './api'
import { countdown, groupDepartures, secondsAgo } from './time'

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
  const p = (routeId: string, directionId: number, departureSeconds: number | null): Prediction => ({
    routeId,
    directionId,
    arrivalTime: null,
    departureTime: departureSeconds === null ? null : at(departureSeconds),
    status: null,
  })

  it('groups by route and direction, soonest first, dropping arrival-only and departed trains', () => {
    const groups = groupDepartures(
      [p('Red', 1, 600), p('Red', 1, 120), p('Orange', 0, 300), p('Red', 1, null), p('Red', 0, -120)],
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
})

describe('secondsAgo', () => {
  it('never goes negative', () => {
    expect(secondsAgo(new Date(now.getTime() + 5000), now)).toBe(0)
    expect(secondsAgo(new Date(now.getTime() - 12_400), now)).toBe(12)
  })
})
