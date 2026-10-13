import { expect, it } from 'vitest'
import type { Route } from './api'
import { directionOf, showsDirection } from './direction'

const route = (id: string, directionNames: string[]) => ({ id, directionNames }) as Route
const red = route('Red', ['South', 'North'])
const bus = route('1', ['Outbound', 'Inbound'])

// Red Line stations, and a train's heading along the track (degrees from north).
const alewife = [42.3958, -71.1418] as const
const jfk = [42.3207, -71.0524] as const
const downtownCrossing = [42.3555, -71.0603] as const
const SOUTH = 180, NORTH = 0

it('a subway train is inbound when it heads toward downtown, outbound when away', () => {
  expect(directionOf(red, 0, ...alewife, SOUTH)).toBe('inbound') // southbound at Alewife
  expect(directionOf(red, 0, ...jfk, SOUTH)).toBe('outbound') // still southbound, past downtown
  expect(directionOf(red, 1, ...jfk, NORTH)).toBe('inbound')
})

it('downtown, or with no heading yet, a train counts as either way', () => {
  expect(directionOf(red, 0, ...downtownCrossing, SOUTH)).toBeUndefined()
  expect(directionOf(red, 0, ...alewife, null)).toBeUndefined()
  expect(showsDirection('inbound', undefined)).toBe(true)
  expect(showsDirection('outbound', undefined)).toBe(true)
})

it("buses (and Mattapan) use MBTA's own Inbound and Outbound, wherever they are", () => {
  expect(directionOf(bus, 1, ...jfk, SOUTH)).toBe('inbound')
  expect(directionOf(bus, 0, ...alewife, SOUTH)).toBe('outbound')
})

it('no filter shows everything; a filter hides the other way', () => {
  expect(showsDirection(undefined, 'outbound')).toBe(true)
  expect(showsDirection('inbound', 'outbound')).toBe(false)
  expect(showsDirection('inbound', 'inbound')).toBe(true)
})
