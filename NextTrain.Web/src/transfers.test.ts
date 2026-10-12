import { describe, expect, it } from 'vitest'
import type { ConnectionPlan, Route } from './api'
import { clock } from './time'
import { adviceText } from './transfers'

const now = new Date('2026-10-10T12:00:00-04:00')
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()
const route = (id: string, name: string, type: Route['type'], shortName: string): Route => ({
  id, name, color: '#003DA5', textColor: '#FFFFFF', directionNames: ['West', 'East'], directionDestinations: ['Bowdoin', 'Wonderland'], type, shortName,
})
const blue = route('Blue', 'Blue Line', 'subway', '')
const sl1 = route('741', 'Logan Airport - South Station', 'bus', 'SL1')
const train = (leaves: number, connection: number | null) => ({ departure: at(leaves), arrival: at(leaves + 2), connection: connection === null ? null : at(connection) })
const plan = (advice: ConnectionPlan['advice'], ...trains: ConnectionPlan['trains']): ConnectionPlan => ({ advice, trains })

describe('adviceText', () => {
  it('no rush: this train or the next make the same connection', () => {
    expect(adviceText(plan('NoRush', train(4, 12), train(9, 12)), blue, 'Government Center', now)).toEqual({
      tone: 'calm', text: `No rush: this one (4 min) or the next (9 min) both make the ${clock(at(12))} Blue Line train.`,
    })
  })

  it('hurry: says when the next connection is, or that it\'s a long wait', () => {
    expect(adviceText(plan('Hurry', train(2, 8), train(6, 21)), blue, 'Government Center', now)).toEqual({
      tone: 'hurry', text: `Hurry: this one (2 min) makes the ${clock(at(8))} Blue Line train. Miss it and the next is ${clock(at(21))}.`,
    })
    expect(adviceText(plan('Hurry', train(2, 8), train(6, null)), blue, 'Government Center', now).text).toMatch(/the next is a long wait\.$/)
  })

  it('names a bus by its route number', () => {
    expect(adviceText(plan('Normal', train(3, 10)), sl1, 'South Station', now).text).toBe(`This one (3 min) connects to the ${clock(at(10))} Route SL1 bus.`)
  })

  it('says when there are no times for the second line yet', () => {
    expect(adviceText(plan('Unknown', train(3, null)), blue, 'Government Center', now)).toEqual({ tone: 'neutral', text: 'No Blue Line times at Government Center yet.' })
    expect(adviceText(plan('Unknown'), blue, 'Government Center', now).tone).toBe('neutral')
  })
})
