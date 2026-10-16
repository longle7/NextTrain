import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { api, API_URL, lineLabel, type Alert, type Commute, type Route } from './api'

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

/** What the Home Screen widget needs for each commute: when it's on, where, and how it looks (NextCommuteWidget.swift). */
export interface WidgetCommute {
  stopId: string
  stationName: string
  routeId: string
  directionId: number
  destination: string
  lineName: string
  lineColor: string
  lineTextColor: string
  windowStart: string // "07:45:00", Boston time
  windowEnd: string
  activeDays: string // "Mon,Tue,Wed,Thu,Fri"
}

interface LiveActivityPlugin {
  isAvailable(): Promise<{ available: boolean }>
  show(details: LiveActivityDetails): Promise<void>
  endAll(): Promise<void>
  setWidgetCommutes(saved: { apiUrl: string; commutes: WidgetCommute[] }): Promise<void>
  addListener(event: 'pushToken', listener: (activity: { commuteId: number; token: string; endsAt: number }) => void): Promise<PluginListenerHandle>
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

/** Ends the Live Activity, and tells our API to stop updating it. */
export const endLiveActivities = () => {
  if (!native) return Promise.resolve(false)
  api('/me/live-activity', { method: 'DELETE' }).catch(() => {})
  return quietly(plugin.endAll())
}

/**
 * At launch (iPhone app): each Live Activity's push token goes to our API, which then keeps its times fresh while the
 * app is closed, until the commute window ends (the API's LiveActivityUpdater).
 */
export function sendLiveActivityTokens() {
  if (!native) return
  plugin
    .addListener('pushToken', (activity) => {
      api('/me/live-activity', { method: 'PUT', body: JSON.stringify(activity) }).catch(() => {}) // the next token retries
    })
    .catch(() => {})
}

/** Gives the Home Screen widget your commutes (none after Delete my data). The widget fetches their times itself. */
export const updateWidget = (commutes: WidgetCommute[]) =>
  native ? quietly(plugin.setWidgetCommutes({ apiUrl: API_URL, commutes })) : Promise.resolve(false)

/** Each commute as the widget shows it: the same line badge, colors, and destination as the Live Activity. */
export function widgetCommutes(commutes: Commute[], routes: Route[]): WidgetCommute[] {
  return commutes.map((c) => {
    const { stationName, destination, lineName, lineColor, lineTextColor } = liveActivityDetails(
      c, routes.find((r) => r.id === c.routeId), [], new Date(0), undefined,
    )
    return {
      stopId: c.mbtaStopId, stationName, routeId: c.routeId, directionId: c.directionId, destination,
      lineName, lineColor, lineTextColor, windowStart: c.windowStart, windowEnd: c.windowEnd, activeDays: c.activeDays,
    }
  })
}

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
    lineName: lineLabel(commute.routeId, route),
    lineColor: route?.color ?? '#7C878E',
    lineTextColor: route?.textColor ?? '#FFFFFF',
    endsAt: Math.round(endsAt.getTime() / 1000),
    departures: departures.map((d) => Math.round(Date.parse(d) / 1000)),
    alert: alert?.summary,
  }
}
