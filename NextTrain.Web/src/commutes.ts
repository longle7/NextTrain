import type { Commute } from './api'
import { clock } from './time'

/** Day names the API uses, in display order. */
export const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BY_DATE_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] // Date.getDay() order

/** A commute starting within this long counts as "soon" and gets live departures. */
const SOON_MS = 60 * 60_000

export type CommuteTiming =
  | { state: 'now'; ends: Date }
  | { state: 'soon' | 'later'; starts: Date }
  | { state: 'never' }

type Schedule = Pick<Commute, 'windowStart' | 'windowEnd' | 'activeDays'>

/**
 * Where a commute's window stands relative to `now`: in progress, starting within the hour, or later.
 * Uses the device's clock, so it assumes the phone is on Boston time.
 */
export function commuteTiming(commute: Schedule, now: Date): CommuteTiming {
  const days = commute.activeDays.split(',')
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    if (!days.includes(BY_DATE_DAY[day.getDay()])) continue
    const start = timeOn(day, commute.windowStart)
    const end = timeOn(day, commute.windowEnd)
    if (start <= now && now < end) return { state: 'now', ends: end }
    if (start > now) return { state: start.getTime() - now.getTime() <= SOON_MS ? 'soon' : 'later', starts: start }
  }
  return { state: 'never' }
}

/** The iPhone Live Activity shows from this long before a commute's window until the window ends. */
export const LIVE_ACTIVITY_LEAD_MS = 15 * 60_000

/** When the commute's Live Activity should end, if it should be showing at `now`; otherwise undefined. */
export function liveActivityEnd(commute: Schedule, now: Date): Date | undefined {
  const timing = commuteTiming(commute, now)
  if (timing.state === 'now') return timing.ends
  if (timing.state === 'soon' && timing.starts.getTime() - now.getTime() <= LIVE_ACTIVITY_LEAD_MS) {
    const length = timeOn(now, commute.windowEnd).getTime() - timeOn(now, commute.windowStart).getTime()
    return new Date(timing.starts.getTime() + length)
  }
  return undefined
}

/** Commutes in progress first, then by how soon they start. */
export function sortCommutes<T extends Schedule>(commutes: T[], now: Date): T[] {
  const rank = (c: T) => {
    const t = commuteTiming(c, now)
    return t.state === 'now' ? 0 : t.state === 'never' ? Infinity : t.starts.getTime()
  }
  return [...commutes].sort((a, b) => rank(a) - rank(b))
}

/** "Now until 8:15 AM", "In 25 min", "Today 5:30 PM", "Tomorrow 7:45 AM", "Mon 7:45 AM". */
export function timingLabel(timing: CommuteTiming, now: Date): string {
  if (timing.state === 'never') return 'No days selected'
  if (timing.state === 'now') return `Now until ${clock(timing.ends)}`
  const minutes = Math.ceil((timing.starts.getTime() - now.getTime()) / 60_000)
  if (timing.state === 'soon') return `In ${minutes} min`
  const days = Math.round((startOfDay(timing.starts) - startOfDay(now)) / 86_400_000)
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : BY_DATE_DAY[timing.starts.getDay()]
  return `${day} ${clock(timing.starts)}`
}

/** "Weekdays", "Weekends", "Every day", or "Mon, Wed, Fri". */
export function daysLabel(activeDays: string): string {
  const days = WEEK.filter((d) => activeDays.split(',').includes(d)).join(',')
  if (days === 'Mon,Tue,Wed,Thu,Fri') return 'Weekdays'
  if (days === 'Sat,Sun') return 'Weekends'
  if (days === WEEK.join(',')) return 'Every day'
  return days.replaceAll(',', ', ')
}

/** "7:45 AM – 8:15 AM" from API times like "07:45:00". */
export const windowLabel = (commute: Schedule) =>
  `${clock(timeOn(new Date(), commute.windowStart))} – ${clock(timeOn(new Date(), commute.windowEnd))}`

function timeOn(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes)
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
