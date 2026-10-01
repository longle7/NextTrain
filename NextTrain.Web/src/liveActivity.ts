import { Capacitor, registerPlugin } from '@capacitor/core'
import { lineLabel, type Alert, type Commute, type Route } from './api'

// The iPhone app's Live Activity: a commute's next trains on the Lock Screen and in the Dynamic Island.
// The native side is ios/App/App/LiveActivityPlugin.swift; on the website every call does nothing.

export interface LiveActivityDetails {
  commuteId: number
  stationName: string
  destination: string
  lineName: string
  lineColor: string
  lineTextColor: string
  endsAt: number // Unix seconds: the end of the commute window
  departures: number[] // Unix seconds, soonest first
  alert?: string
}

interface LiveActivityPlugin {
  isAvailable(): Promise<{ available: boolean }>
  show(details: LiveActivityDetails): Promise<void>
  endAll(): Promise<void>
}

const plugin = registerPlugin<LiveActivityPlugin>('LiveActivity')
const native = Capacitor.isNativePlatform()

// A Live Activity is a nice extra: if iOS refuses one (turned off in Settings, too many running), the app carries on.
// Resolves to whether it worked.
const quietly = (action: Promise<void>) =>
  action.then(
    () => true,
    (error) => {
      console.warn('Live Activity:', error)
      return false
    },
  )

/** False on the website, before iOS 16.2, and when Live Activities are turned off for NextTrain in iOS Settings. */
export const liveActivitiesAvailable = async () =>
  native && (await plugin.isAvailable().catch(() => ({ available: false }))).available

/** Starts or updates this commute's Live Activity, and ends any other: one commute shows at a time. */
export const showLiveActivity = (details: LiveActivityDetails) => (native ? quietly(plugin.show(details)) : Promise.resolve(false))

export const endLiveActivities = () => (native ? quietly(plugin.endAll()) : Promise.resolve(false))

/** What the Live Activity shows for a commute: its line, station, direction, next departures, and worst alert. */
export function liveActivityDetails(
  commute: Commute,
  route: Route | undefined,
  departures: string[],
  endsAt: Date,
  alert: Alert | undefined,
): LiveActivityDetails {
  return {
    commuteId: commute.id,
    stationName: commute.stationName,
    destination: route?.directionDestinations[commute.directionId] ?? '',
    lineName: lineLabel(commute.routeId),
    lineColor: route?.color ?? '#7C878E',
    lineTextColor: route?.textColor ?? '#FFFFFF',
    endsAt: Math.round(endsAt.getTime() / 1000),
    departures: departures.map((d) => Math.round(Date.parse(d) / 1000)),
    alert: alert?.summary,
  }
}
