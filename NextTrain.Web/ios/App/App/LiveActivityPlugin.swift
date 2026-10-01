import ActivityKit
import Capacitor
import Foundation

/// The web app's bridge to Live Activities (see src/liveActivity.ts). One commute shows at a time: showing a commute
/// updates its Live Activity if it's already up, starts it if not, and ends any other commute's.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
    ]

    /// False before iOS 16.2, or when the user turned Live Activities off for NextTrain in iOS Settings.
    @objc func isAvailable(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve(["available": false]) }
        call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    @objc func show(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        guard let commuteId = call.getInt("commuteId"),
              let stationName = call.getString("stationName"),
              let destination = call.getString("destination"),
              let lineName = call.getString("lineName"),
              let lineColor = call.getString("lineColor"),
              let lineTextColor = call.getString("lineTextColor"),
              let endsAt = call.getDouble("endsAt")
        else { return call.reject("Missing commute details") }

        let state = CommuteActivityAttributes.ContentState(
            departures: (call.getArray("departures") ?? []).compactMap { ($0 as? NSNumber)?.doubleValue },
            alert: call.getString("alert"))
        // Stale at the end of the commute window: the view then says the commute is over instead of showing times.
        let content = ActivityContent(state: state, staleDate: Date(timeIntervalSince1970: endsAt))

        Task {
            var current: Activity<CommuteActivityAttributes>?
            for activity in Activity<CommuteActivityAttributes>.activities {
                if current == nil && activity.attributes.commuteId == commuteId {
                    current = activity
                } else {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            if let current {
                await current.update(content)
                return call.resolve()
            }
            do {
                let attributes = CommuteActivityAttributes(
                    commuteId: commuteId, stationName: stationName, destination: destination,
                    lineName: lineName, lineColor: lineColor, lineTextColor: lineTextColor)
                _ = try Activity.request(attributes: attributes, content: content)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        Task {
            for activity in Activity<CommuteActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
