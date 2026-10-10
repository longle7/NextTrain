import { describe, expect, it } from 'vitest'
import { commuteTiming, daysLabel, liveActivityEnd, sortCommutes, stepNumbers, timingLabel } from './commutes'

// Tuesday 29 Sep 2026, 7:50 AM device time.
const now = new Date(2026, 8, 29, 7, 50)
const commute = (windowStart: string, windowEnd: string, activeDays = 'Mon,Tue,Wed,Thu,Fri') => ({ windowStart, windowEnd, activeDays })

describe('commuteTiming', () => {
  it('is "now" inside the window', () => {
    expect(commuteTiming(commute('07:45:00', '08:15:00'), now)).toEqual({ state: 'now', ends: new Date(2026, 8, 29, 8, 15) })
  })

  it('is "soon" within an hour of the start', () => {
    expect(commuteTiming(commute('08:30:00', '09:00:00'), now)).toEqual({ state: 'soon', starts: new Date(2026, 8, 29, 8, 30) })
  })

  it('is "later" today, or on the next active day once today\'s window has passed', () => {
    expect(commuteTiming(commute('17:00:00', '17:30:00'), now)).toEqual({ state: 'later', starts: new Date(2026, 8, 29, 17, 0) })
    expect(commuteTiming(commute('07:00:00', '07:30:00'), now)).toEqual({ state: 'later', starts: new Date(2026, 8, 30, 7, 0) })
    expect(commuteTiming(commute('07:00:00', '07:30:00', 'Sat'), now)).toEqual({ state: 'later', starts: new Date(2026, 9, 3, 7, 0) })
  })

  it('is "never" with no days', () => {
    expect(commuteTiming(commute('07:00:00', '07:30:00', ''), now)).toEqual({ state: 'never' })
  })
})

it('sortCommutes puts the one in progress first, then soonest', () => {
  const evening = commute('17:00:00', '17:30:00')
  const current = commute('07:45:00', '08:15:00')
  const soon = commute('08:30:00', '09:00:00')
  expect(sortCommutes([evening, soon, current], now)).toEqual([current, soon, evening])
})

it('timingLabel counts down to a commute starting soon', () => {
  expect(timingLabel(commuteTiming(commute('08:30:00', '09:00:00'), now), now)).toBe('In 40 min')
  expect(timingLabel(commuteTiming(commute('07:00:00', '07:30:00'), now), now)).toMatch(/^Tomorrow /)
})

it.each([
  ['Mon,Tue,Wed,Thu,Fri', 'Weekdays'],
  ['Sun,Sat', 'Weekends'],
  ['Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'Every day'],
  ['Fri,Mon,Wed', 'Mon, Wed, Fri'],
])('daysLabel(%s) is %s', (days, expected) => {
  expect(daysLabel(days)).toBe(expected)
})

describe('liveActivityEnd (the iPhone Live Activity shows from 15 min before a commute until it ends)', () => {
  it('shows during the window, until its end', () => {
    expect(liveActivityEnd(commute('07:45:00', '08:15:00'), now)).toEqual(new Date(2026, 8, 29, 8, 15))
  })

  it('shows from 15 minutes before the start, ending when the window does', () => {
    expect(liveActivityEnd(commute('08:05:00', '08:35:00'), now)).toEqual(new Date(2026, 8, 29, 8, 35))
  })

  it("doesn't show earlier than that, after the window, or on days the commute is off", () => {
    expect(liveActivityEnd(commute('08:06:00', '08:35:00'), now)).toBeUndefined()
    expect(liveActivityEnd(commute('07:00:00', '07:30:00'), now)).toBeUndefined()
    expect(liveActivityEnd(commute('07:45:00', '08:15:00', 'Sat,Sun'), now)).toBeUndefined()
  })

  it('covers a window that starts just after midnight', () => {
    const lateNight = new Date(2026, 8, 29, 23, 50)
    expect(liveActivityEnd(commute('00:05:00', '00:35:00', 'Wed'), lateNight)).toEqual(new Date(2026, 8, 30, 0, 35))
  })
})

describe('stepNumbers', () => {
  it('numbers the commute form steps as shown, skipping hidden ones', () => {
    expect(stepNumbers([true, true, true])).toEqual([2, 3, 4])
    expect(stepNumbers([false, true, true])).toEqual([undefined, 2, 3]) // one line: no "Which line?"
    expect(stepNumbers([false, false, true])).toEqual([undefined, undefined, 2]) // no stop picked yet
  })
})
