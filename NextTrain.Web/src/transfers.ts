import { lineLabel, type ConnectionPlan, type Route } from './api'
import { clock, countdown } from './time'

export type AdviceTone = 'calm' | 'hurry' | 'neutral'

/**
 * Transfer advice as a sentence, from GET /connections. `toRoute` is the line the rider changes onto, `via` the
 * station where they change. "This one" is the next train (or bus) of the first ride.
 *   No rush: "No rush: this one (4 min) or the next (9 min) both make the 8:42 Blue Line train."
 *   Hurry:   "Hurry: this one (2 min) makes the 8:42 Blue Line train. Miss it and the next is 8:55."
 */
export function adviceText(plan: ConnectionPlan, toRoute: Route | undefined, via: string, now: Date): { tone: AdviceTone; text: string } {
  const bus = toRoute?.type === 'bus'
  const line = toRoute ? (bus ? `Route ${lineLabel(toRoute.id, toRoute)}` : toRoute.name) : 'connecting'
  const makes = (time: string) => `the ${clock(time)} ${line} ${bus ? 'bus' : 'train'}`
  const when = (time: string) => countdown(time, now) ?? 'now'
  const [first, next] = plan.trains
  if (plan.advice === 'Unknown' || !first?.connection) {
    return { tone: 'neutral', text: `No ${line} times at ${via} yet.` }
  }
  if (plan.advice === 'NoRush' && next) {
    return { tone: 'calm', text: `No rush: this one (${when(first.departure)}) or the next (${when(next.departure)}) both make ${makes(first.connection)}.` }
  }
  if (plan.advice === 'Hurry') {
    const after = next?.connection ? clock(next.connection) : 'a long wait'
    return { tone: 'hurry', text: `Hurry: this one (${when(first.departure)}) makes ${makes(first.connection)}. Miss it and the next is ${after}.` }
  }
  return { tone: 'neutral', text: `This one (${when(first.departure)}) connects to ${makes(first.connection)}.` }
}
