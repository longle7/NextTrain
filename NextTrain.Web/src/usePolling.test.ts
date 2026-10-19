import { expect, it } from 'vitest'
import { dueIn } from './usePolling'

const now = Date.parse('2026-10-17T08:00:00Z')
const ago = (ms: number) => new Date(now - ms)

it('waits out the rest of the interval when the data showing is younger than it', () => {
  expect(dueIn(ago(45_000), 120_000, now)).toBe(75_000) // alerts another page loaded 45 s ago
  expect(dueIn(ago(0), 10_000, now)).toBe(10_000)
})

it('loads at once when the data is as old as the interval or older, or there is none', () => {
  expect(dueIn(ago(10_000), 10_000, now)).toBe(0)
  expect(dueIn(ago(3_600_000), 10_000, now)).toBe(0) // remembered from yesterday's ride
  expect(dueIn(undefined, 10_000, now)).toBe(0)
})

it('always loads a one-off (no interval), and data dated in the future (the clock was changed)', () => {
  expect(dueIn(ago(1_000), undefined, now)).toBe(0)
  expect(dueIn(ago(-60_000), 10_000, now)).toBe(0)
})
